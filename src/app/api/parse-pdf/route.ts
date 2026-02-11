import "@ungap/with-resolvers";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { AnalysisResult, TestScores, RecommendedSchool } from "@/lib/types";
import { enrichSchoolsWithScorecardData, getEnrollmentSize, deduplicateByName, fillGapsFromScorecard } from "@/lib/scorecard";
import { isTestRequiredSchool, TEST_REQUIRED_SCHOOLS, getSchoolRegion } from "@/lib/constants";

// Disable all Vercel caching — always fetch fresh Scorecard data
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Resolve worker path via Next.js optimized URL constructor
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const textParts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .join(" ");
    textParts.push(pageText);
  }

  doc.destroy();
  return textParts.join("\n");
}

/** Trim redundant whitespace and repeated header lines to reduce token count. */
function trimPdfText(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .filter((line) => line.length > 0)
    .filter((line, i, arr) => i === 0 || line !== arr[i - 1]) // dedupe consecutive identical lines
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const schoolProfileFile = formData.get("schoolProfile") as File | null;
    const transcriptFile = formData.get("transcript") as File | null;

    if (!schoolProfileFile || !transcriptFile) {
      return NextResponse.json(
        { error: "Both School Profile and Student Transcript are required" },
        { status: 400 }
      );
    }

    // Extract home state from formData (may not be sent by parent portal yet)
    const homeState = (formData.get("homeState") as string) || null;

    // Extract test scores from formData
    const testScores: TestScores = {};
    const satReading = formData.get("satReading");
    const satMath = formData.get("satMath");
    const actComposite = formData.get("actComposite");

    if (satReading) testScores.satReading = parseInt(satReading as string);
    if (satMath) testScores.satMath = parseInt(satMath as string);
    if (actComposite) testScores.actComposite = parseInt(actComposite as string);

    // Extract manual GPA override and school count
    const manualGPA = parseFloat((formData.get("manualGPA") as string) || "0");
    const schoolCount = parseInt((formData.get("schoolCount") as string) || "9");

    // Extract text from PDFs
    const schoolProfileBuffer = Buffer.from(await schoolProfileFile.arrayBuffer());
    const transcriptBuffer = Buffer.from(await transcriptFile.arrayBuffer());

    const [schoolProfileText, transcriptText] = await Promise.all([
      extractTextFromPDF(schoolProfileBuffer).then(trimPdfText),
      extractTextFromPDF(transcriptBuffer).then(trimPdfText),
    ]);

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Generate analysis using OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert college admissions counselor specializing in course rigor analysis.
        Your task is to analyze a student's transcript against their school's profile to evaluate the rigor of their course selections.

        Provide your response in the following JSON format:
        {
          "scorecard": {
            "overallScore": <number 0-100>,
            "maxScore": 100,
            "scores": [
              {
                "category": "<category name>",
                "score": <number>,
                "maxScore": <number>,
                "description": "<brief description>"
              }
            ]
          },
          "recalculatedGPA": <number on 4.0 scale, up to 5.0 with weighting>,
          "narrative": "<A detailed 2-3 paragraph counselor narrative suitable for college applications>",
          "schoolProfileSummary": "<Brief summary of the school's offerings>",
          "transcriptSummary": "<Brief summary of the student's course history>",
          "recommendedSchools": [
            {
              "name": "<college name>",
              "url": "<official college website URL, e.g., https://www.stanford.edu>",
              "type": "<reach|match|safety>",
              "region": "<Northeast|Mid-Atlantic|South|Midwest|West>",
              "campusSize": "<Micro|Small|Medium|Large|Mega>",
              "enrollment": <approximate undergraduate enrollment number>,
              "testPolicy": "<Test Optional|Test Required|Test Blind>",
              "acceptanceProbability": <number 1-95, exact percentage likelihood of acceptance>,
              "matchReasoning": "<2-3 sentence explanation connecting the school's specific academic strengths to the student's transcript>"
            }
          ],
          "gapAnalysis": [
            {
              "subject": "<subject area like Math, Science, English, etc>",
              "offered": ["<courses offered by school>"],
              "taken": ["<courses student took>"],
              "missed": ["<rigorous courses that were available AND grade-appropriate but not taken - leave empty if student hasn't reached the grade level for advanced courses>"]
            }
          ],
          "studentGradeLevel": "<9th|10th|11th|12th - the student's current grade level>"
        }

        RECALCULATED ACADEMIC CORE GPA (CRITICAL):
        USE ONLY THESE DETERMINISTIC MAPPINGS — do not interpolate or estimate.
        NEVER use the school-reported GPA — always recalculate from raw grades.
        - Extract raw grades from the transcript for these academic core subjects ONLY:
          * Math (Algebra, Geometry, Precalculus, Calculus, Statistics, etc.)
          * Science (Biology, Chemistry, Physics, Environmental Science, etc.)
          * English (English 9-12, Literature, Composition, etc.)
          * Social Studies (History, Government, Economics, Psychology, etc.)
          * World Languages (Spanish, French, Latin, Mandarin, etc.)
        - EXCLUDE: PE, Health, Art, Music, Drama, Technology, Study Hall, Advisory, and all other non-academic electives
        - Convert letter grades to the standard 4.0 scale: A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, C-=1.7, D+=1.3, D=1.0, F=0.0
        - If the transcript uses percentage grades instead of letters, convert first: 90-100=A, 80-89=B, 70-79=C, 60-69=D, <60=F
        - Apply college weighting: add +0.5 for Honors courses, add +1.0 for AP/IB/Advanced courses
        - Calculate the weighted average across all academic core courses
        - Report the result rounded to 2 decimal places (e.g., 3.85, 4.23)
        - If grades cannot be extracted from the transcript, estimate based on course performance indicators

        Categories to evaluate for scorecard:
        1. AP/IB Course Load (0-25): How many advanced courses relative to availability
        2. Honors Course Selection (0-20): Honors courses taken when AP not available
        3. Core Subject Rigor (0-25): Rigor in Math, Science, English, Social Studies
        4. Foreign Language Depth (0-15): Years and level of foreign language study
        5. Academic Progression (0-15): Trend showing increasing challenge over time

        CRITICAL SCORING RULE: Each category score must NEVER exceed its maxScore.
        - AP/IB Course Load: score must be 0-25, never higher
        - Honors Course Selection: score must be 0-20, never higher
        - Core Subject Rigor: score must be 0-25, never higher
        - Foreign Language Depth: score must be 0-15, never higher
        - Academic Progression: score must be 0-15, never higher
        If calculated points would exceed the maximum, cap at the maximum.

        For recommendedSchools:
        - Conduct a NATIONAL search across the entire United States - do NOT limit to any single state or region
        - Generate exactly 30 recommended colleges in the recommendedSchools array:
          * 10 reach, 10 match, 10 safety
          * At least 2 schools per region (Northeast, Mid-Atlantic, South, Midwest, West) — that's at least 10 schools spread across regions
          * At least 2 schools per size category (Micro, Small, Medium, Large, Mega) — that's at least 10 schools spread across sizes
          * Every region+size combination does not need to be covered, but ensure broad coverage
        - This large pool allows client-side filtering. The UI will show 9 schools (3/3/3) from this pool.
        - Specifically value independent school rigor and challenging curricula
        ABSOLUTE REQUIREMENT — TEST POLICY ACCURACY (CRITICAL):
        - Include "testPolicy" for each school: "Test Optional", "Test Required", or "Test Blind"
          * Test Optional: SAT/ACT scores considered if submitted but not required
          * Test Required: SAT/ACT scores mandatory for all applicants
          * Test Blind: SAT/ACT scores not considered even if submitted
        - The following schools are KNOWN to be TEST REQUIRED — you MUST label them "Test Required":
          Harvard, Yale, Princeton, Columbia, Penn, Brown, Dartmouth, Cornell,
          MIT, Stanford, Caltech, Georgetown, Duke, Vanderbilt, Rice, Johns Hopkins,
          Northwestern, University of Chicago, Carnegie Mellon, Emory,
          Georgia Tech, Purdue, UT Austin, University of Florida, University of Tennessee,
          University of Virginia, UNC, University of Georgia, Florida State,
          Virginia Tech, Texas A&M, Clemson
        - Do NOT label any of the above schools as "Test Optional" or "Test Blind". No exceptions.

        ABSOLUTE REQUIREMENT — REGION ACCURACY (CRITICAL):
        - The "region" field MUST be the CORRECT geographic region for each school's ACTUAL state location.
        - Use these EXACT state-to-region mappings:
          * Northeast: Massachusetts, Connecticut, Rhode Island, Maine, Vermont, New Hampshire, New York
          * Mid-Atlantic: Pennsylvania, New Jersey, Delaware, Maryland, Virginia, West Virginia, DC
          * South: North Carolina, South Carolina, Georgia, Florida, Alabama, Mississippi, Louisiana, Tennessee, Kentucky, Arkansas, Texas, Oklahoma
          * Midwest: Ohio, Michigan, Indiana, Illinois, Wisconsin, Minnesota, Iowa, Missouri, Kansas, Nebraska, South Dakota, North Dakota
          * West: California, Oregon, Washington, Colorado, Arizona, Nevada, Utah, New Mexico, Idaho, Montana, Wyoming, Hawaii, Alaska
        - VERIFY: Look up each school's actual state, then assign the region from the mapping above.
        - Georgetown (DC) → Mid-Atlantic. Georgia Tech (Georgia) → South. Northwestern (Illinois) → Midwest. Stanford (California) → West.
        - Do NOT guess regions. Do NOT recommend more than 2 schools from any single state.
        - Include schools from at least 4 different regions for diversity.

        ABSOLUTE REQUIREMENT — ENROLLMENT ACCURACY (CRITICAL):
        - The "enrollment" field MUST be the REAL undergraduate enrollment number for each school. Do NOT guess or estimate.
        - The "campusSize" label MUST match the enrollment number using these EXACT ranges:
          * Micro: Under 2,000 undergraduates (e.g., Amherst, Williams, Pomona, Swarthmore)
          * Small: 2,000-5,000 undergraduates (e.g., Carleton, Davidson, Bowdoin, Middlebury)
          * Medium: 5,000-15,000 undergraduates (e.g., Wake Forest, Tulane, Georgetown, Boston College)
          * Large: 15,000-30,000 undergraduates (e.g., Michigan, UCLA, UNC, Virginia)
          * Mega: 30,000+ undergraduates (e.g., Ohio State, UT Austin, Penn State, Arizona State)
        - If enrollment = 7,500, campusSize MUST be "Medium" (5,000-15,000). No exceptions.
        - If enrollment = 45,000, campusSize MUST be "Mega" (30,000+). No exceptions.
        - VERIFY: For each school, confirm that the enrollment number falls within the stated campusSize range.
        - Include a mix of campus sizes for diversity.

        MATCH REASONING REQUIREMENTS:
        - Base reasoning on how the school's SPECIFIC academic strengths align with the student's transcript
        - Reference the school's notable programs, departments, or academic culture
        - Connect to evidence from the student's course selections (e.g., "Your strong STEM course load aligns with Georgia Tech's renowned engineering program")
        - For independent/prep school students, mention schools known to value rigorous secondary preparation

        ACCEPTANCE PROBABILITY ENGINE (CRITICAL):
        - For EACH recommended school, calculate an exact percentage likelihood of acceptance (acceptanceProbability)
        - Formula weights:
          * Recalculated GPA vs. school's median freshman GPA (primary factor — 77% of colleges prioritize grades)
          * Rigor Score / 100 (secondary factor — 64% of colleges prioritize curriculum strength)
          * SAT/ACT scores vs. school's middle 50% range (when provided)
        - For Test Required schools: weight test scores MORE heavily
        - For Test Optional/Blind schools: weight GPA and rigor MORE heavily
        - HARD CAP: Maximum 95% (never guarantee admission, even for safeties)
        - HARD FLOOR: Minimum 1% for Ivy-plus and ultra-selective reaches (sub-10% acceptance rate schools)
        - CATEGORY THRESHOLDS (use acceptanceProbability to assign type):
          * Reach: acceptanceProbability < 40%
          * Match: acceptanceProbability 40%-74%
          * Safety: acceptanceProbability >= 75%
        - Be precise — output an integer like 62, not a range

        TEST SCORE INTEGRATION (when provided):
        - If SAT or ACT scores are provided, use them to refine reach/match/safety categorization AND acceptance probability
        - SAT Total 1500+ or ACT 34+: Student is competitive at highly selective schools
        - SAT Total 1400-1499 or ACT 31-33: Student is competitive at very selective schools
        - SAT Total 1300-1399 or ACT 28-30: Student is competitive at selective schools
        - SAT Total 1200-1299 or ACT 24-27: Student is competitive at moderately selective schools
        - Below these thresholds: Focus recommendations on schools where student's rigor can shine without test score emphasis
        - For Test Required schools, weight test scores MORE heavily in reach/match/safety determination
        - For Test Optional/Blind schools, weight course rigor MORE heavily

        For gapAnalysis:
        - For EACH subject area, identify the SINGLE course the student is CURRENTLY taking this term
        - The "taken" field should contain ONLY that one current course, not courses from previous years
        - The "offered" field should list ALL courses the school offers in that subject area, from least to most rigorous
        - The "missed" field is the CRITICAL part. Apply this logic strictly:

          STEP 1: Identify the student's current course in the subject
          STEP 2: Check if a MORE RIGOROUS version of that same course exists at the school
          STEP 3: If yes, that more rigorous version IS a missed opportunity

          Examples of missed opportunities:
          - Student in "Chemistry" when "Honors Chemistry" exists → missed: ["Honors Chemistry"]
          - Student in "Algebra 2" when "Honors Algebra 2" or "Accelerated Algebra 2" exists → missed: ["Honors Algebra 2"] or ["Accelerated Algebra 2"]
          - Student in "English 10" when "Honors English 10" exists → missed: ["Honors English 10"]
          - Student in "Biology" when "Honors Biology" exists → missed: ["Honors Biology"]

          Examples of NO missed opportunity:
          - Student in "Honors Spanish 3" and no higher Spanish course exists for their grade → missed: [] (they ARE in the most rigorous option)
          - Student in "Modern World History" and that's the ONLY history course offered for their grade → missed: [] (no alternative exists)
          - Student in "English 10" and no "Honors English 10" exists at the school → missed: [] (no honors version available)

          NEVER say "All rigorous options taken" if an honors/accelerated/AP version of the student's current course exists and they are NOT enrolled in it.
          ONLY say the student has taken all rigorous options if they are LITERALLY in the highest-level version of the course available for their grade.

          The missed array must contain the specific course names, not generic descriptions.

        - Include at least: Math, Science, English, Social Studies, Foreign Language
        - Be thorough and strict. It is better to flag a potential missed opportunity than to miss one.
        - A course is "taken" ONLY if its EXACT course title appears in the TRANSCRIPT PDF with an associated grade or mark
        - SOURCE ISOLATION: The School Profile tells you what is OFFERED. The Transcript tells you what is TAKEN. Never copy a course from "offered" into "taken" unless the TRANSCRIPT independently confirms it with a grade

        The narrative should be written in a professional tone suitable for a counselor letter,
        highlighting the student's academic choices in context of what the school offers.`,
        },
        {
          role: "user",
          content: `Please analyze the following documents:

SCHOOL PROFILE:
${schoolProfileText}

---

STUDENT TRANSCRIPT:
${transcriptText}

${testScores.satReading || testScores.satMath || testScores.actComposite ? `---

STUDENT TEST SCORES:
${testScores.satReading && testScores.satMath ? `SAT: ${testScores.satReading} (Reading/Writing) + ${testScores.satMath} (Math) = ${testScores.satReading + testScores.satMath} Total` : ""}
${testScores.actComposite ? `ACT Composite: ${testScores.actComposite}` : ""}

Use these test scores to refine the reach/match/safety categorization of recommended schools.` : ""}

Provide your comprehensive rigor analysis in the specified JSON format.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Failed to generate analysis" },
        { status: 500 }
      );
    }

    const analysis = JSON.parse(content) as AnalysisResult;

    // Apply manual GPA override if provided
    if (manualGPA > 0) {
      analysis.recalculatedGPA = manualGPA;
      console.log("[Override] GPA manually set to:", manualGPA);
    }

    // Post-process gapAnalysis to catch missed opportunities GPT missed
    if (analysis.gapAnalysis && Array.isArray(analysis.gapAnalysis)) {
      analysis.gapAnalysis = analysis.gapAnalysis.map((gap: any) => {
        const takenRaw = gap.taken;
        const takenStr = Array.isArray(takenRaw) ? takenRaw[0] || "" : (takenRaw || "");
        const taken = (typeof takenStr === "string" ? takenStr : String(takenStr)).toLowerCase();
        const offered = (gap.offered || []).map((c: string) => c);
        const offeredLower = offered.map((c: string) => c.toLowerCase());

        // Check if there's an honors/accelerated/AP version of what they're taking
        const missed: string[] = [];

        for (let i = 0; i < offered.length; i++) {
          const course = offeredLower[i];
          const courseName = offered[i];

          // Skip the course they're already taking
          if (course === taken) continue;

          // Check if this is a more rigorous version of their current course
          const takenBase = taken.replace(/^(honors |accelerated |ap |advanced |ib )/i, "").trim();
          const courseBase = course.replace(/^(honors |accelerated |ap |advanced |ib )/i, "").trim();

          // Must be same base course (not just substring match)
          const isSameBase = courseBase === takenBase;

          if (isSameBase) {
            const isCurrentMoreRigorous = /^(honors |accelerated |ap |advanced |ib )/i.test(taken);
            const isThisMoreRigorous = /^(honors |accelerated |ap |advanced |ib )/i.test(course);

            if (isThisMoreRigorous && !isCurrentMoreRigorous) {
              missed.push(courseName);
            }
          }
        }

        // Override GPT's missed field if we found issues
        if (missed.length > 0) {
          gap.missed = missed;
        }

        // Filter out AP/Advanced/IB courses that are typically junior/senior level
        const advancedPrefixes = ["advanced ", "ap ", "ib "];
        gap.missed = (gap.missed || []).filter((course: string) => {
          const lower = course.toLowerCase();
          // Keep honors versions (available at any level) but filter out AP/Advanced/IB
          return !advancedPrefixes.some(prefix => lower.startsWith(prefix));
        });

        return gap;
      });

      console.log("[GapFix] Post-processed gap analysis:",
        analysis.gapAnalysis.map((g: any) => `${g.subject}: taken=${g.taken}, missed=${(g.missed || []).length}`).join(", ")
      );
    }

    // ── Unified metadata correction: campusSize + region + testPolicy ────
    // GPT can hallucinate enrollment, mislabel regions, or assign wrong
    // test policies.  Correct ALL three in a single pass using hard-coded
    // authoritative data, then deduplicate.
    if (analysis.recommendedSchools) {
      analysis.recommendedSchools = analysis.recommendedSchools.map((s) => {
        let fixed = s;
        // 1. Correct campusSize from enrollment
        if (fixed.enrollment && fixed.enrollment > 0) {
          const correctSize = getEnrollmentSize(fixed.enrollment);
          if (correctSize !== fixed.campusSize) {
            console.log(
              `[MetaCorrect] ${fixed.name}: campusSize "${fixed.campusSize}" → "${correctSize}" (enrollment=${fixed.enrollment})`
            );
            fixed = { ...fixed, campusSize: correctSize };
          }
        }
        // 2. Correct region from state mapping
        const correctRegion = getSchoolRegion(fixed.name);
        if (correctRegion && correctRegion !== fixed.region) {
          console.log(
            `[MetaCorrect] ${fixed.name}: region "${fixed.region}" → "${correctRegion}"`
          );
          fixed = { ...fixed, region: correctRegion };
        }
        // 3. Correct test policy from override list
        if (isTestRequiredSchool(fixed.name) && fixed.testPolicy !== "Test Required") {
          console.log(
            `[MetaCorrect] ${fixed.name}: testPolicy "${fixed.testPolicy}" → "Test Required"`
          );
          fixed = { ...fixed, testPolicy: "Test Required" };
        }
        return fixed;
      });
      // Deduplicate — GPT can return the same school twice
      analysis.recommendedSchools = deduplicateByName(analysis.recommendedSchools);
      console.log(`[InitialPDF] ${analysis.recommendedSchools.length} schools after correction + dedup`);
    }

    // BACKUP: Guarantee every size and region category has schools BEFORE enrichment
    const backupSchools: RecommendedSchool[] = [
      // MICRO - Northeast
      { name: "Williams College", url: "https://www.williams.edu", type: "reach", region: "Northeast", campusSize: "Micro", enrollment: 2000, testPolicy: "Test Optional", matchReasoning: "Williams' rigorous liberal arts curriculum and small class sizes align well with this student's strong academic foundation." },
      { name: "Colby College", url: "https://www.colby.edu", type: "match", region: "Northeast", campusSize: "Micro", enrollment: 2000, testPolicy: "Test Optional", matchReasoning: "Colby's commitment to undergraduate research and global engagement align with this student's academic trajectory." },
      { name: "Bates College", url: "https://www.bates.edu", type: "safety", region: "Northeast", campusSize: "Micro", enrollment: 1800, testPolicy: "Test Optional", matchReasoning: "Bates' test-optional policy and emphasis on experiential learning make it an accessible option." },
      { name: "Amherst College", url: "https://www.amherst.edu", type: "reach", region: "Northeast", campusSize: "Micro", enrollment: 1900, testPolicy: "Test Optional", matchReasoning: "Amherst's open curriculum and emphasis on intellectual exploration complement diverse academic interests." },
      // MICRO - Mid-Atlantic
      { name: "Haverford College", url: "https://www.haverford.edu", type: "match", region: "Mid-Atlantic", campusSize: "Micro", enrollment: 1400, testPolicy: "Test Optional", matchReasoning: "Haverford's honor code and close-knit academic community foster intellectual engagement." },
      { name: "Swarthmore College", url: "https://www.swarthmore.edu", type: "reach", region: "Mid-Atlantic", campusSize: "Micro", enrollment: 1600, testPolicy: "Test Optional", matchReasoning: "Swarthmore's honors program and intellectual rigor attract students who thrive on academic challenge." },
      // MICRO - South
      { name: "Rhodes College", url: "https://www.rhodes.edu", type: "safety", region: "South", campusSize: "Micro", enrollment: 2000, testPolicy: "Test Optional", matchReasoning: "Rhodes' strong liberal arts tradition and Memphis location offer academics and community engagement." },
      { name: "Centre College", url: "https://www.centre.edu", type: "safety", region: "South", campusSize: "Micro", enrollment: 1500, testPolicy: "Test Optional", matchReasoning: "Centre's guaranteed study abroad and high graduate school placement reflect its commitment to student success." },
      { name: "Hendrix College", url: "https://www.hendrix.edu", type: "safety", region: "South", campusSize: "Micro", enrollment: 1100, testPolicy: "Test Optional", matchReasoning: "Hendrix's engaged learning requirement ensures hands-on academic experiences." },
      // MICRO - Midwest
      { name: "Grinnell College", url: "https://www.grinnell.edu", type: "match", region: "Midwest", campusSize: "Micro", enrollment: 1700, testPolicy: "Test Optional", matchReasoning: "Grinnell's self-governed curriculum and strong mentorship suit students who take initiative." },
      { name: "Kenyon College", url: "https://www.kenyon.edu", type: "match", region: "Midwest", campusSize: "Micro", enrollment: 1700, testPolicy: "Test Optional", matchReasoning: "Kenyon's renowned writing program and close faculty relationships foster deep academic engagement." },
      { name: "Wabash College", url: "https://www.wabash.edu", type: "safety", region: "Midwest", campusSize: "Micro", enrollment: 800, testPolicy: "Test Optional", matchReasoning: "Wabash's strong alumni network and personalized education support student success." },
      // MICRO - West
      { name: "Pomona College", url: "https://www.pomona.edu", type: "reach", region: "West", campusSize: "Micro", enrollment: 1800, testPolicy: "Test Optional", matchReasoning: "Pomona's intimate environment and Claremont Consortium access offer both depth and breadth." },
      { name: "Harvey Mudd College", url: "https://www.hmc.edu", type: "reach", region: "West", campusSize: "Micro", enrollment: 900, testPolicy: "Test Optional", matchReasoning: "Harvey Mudd's STEM focus combined with liberal arts breadth suits analytically minded students." },
      { name: "Claremont McKenna College", url: "https://www.cmc.edu", type: "reach", region: "West", campusSize: "Micro", enrollment: 1400, testPolicy: "Test Optional", matchReasoning: "CMC's leadership focus and small seminar-style classes foster engaged, analytical thinkers." },
      { name: "Colorado College", url: "https://www.coloradocollege.edu", type: "match", region: "West", campusSize: "Micro", enrollment: 2000, testPolicy: "Test Optional", matchReasoning: "Colorado College's unique block plan allows deep immersion in one subject at a time." },
      { name: "Occidental College", url: "https://www.oxy.edu", type: "match", region: "West", campusSize: "Micro", enrollment: 2000, testPolicy: "Test Optional", matchReasoning: "Oxy's LA location and commitment to equity provide a distinctive liberal arts experience." },
      // SMALL
      { name: "Davidson College", url: "https://www.davidson.edu", type: "reach", region: "South", campusSize: "Small", enrollment: 2000, testPolicy: "Test Optional", matchReasoning: "Davidson's honor code and rigorous academics attract students who thrive in challenging environments." },
      { name: "Bowdoin College", url: "https://www.bowdoin.edu", type: "reach", region: "Northeast", campusSize: "Small", enrollment: 2000, testPolicy: "Test Optional", matchReasoning: "Bowdoin's commitment to the common good and strong science programs complement strong academic profiles." },
      { name: "Bucknell University", url: "https://www.bucknell.edu", type: "match", region: "Mid-Atlantic", campusSize: "Small", enrollment: 3800, testPolicy: "Test Optional", matchReasoning: "Bucknell's blend of liberal arts and professional programs provides flexibility for exploration." },
      { name: "Whitman College", url: "https://www.whitman.edu", type: "match", region: "West", campusSize: "Small", enrollment: 1500, testPolicy: "Test Optional", matchReasoning: "Whitman's discussion-based classes and research opportunities foster intellectual engagement." },
      { name: "Elon University", url: "https://www.elon.edu", type: "safety", region: "South", campusSize: "Small", enrollment: 4600, testPolicy: "Test Optional", matchReasoning: "Elon's experiential learning focus and study abroad program suit well-rounded students." },
      { name: "College of Wooster", url: "https://www.wooster.edu", type: "safety", region: "Midwest", campusSize: "Small", enrollment: 2000, testPolicy: "Test Optional", matchReasoning: "Wooster's Independent Study program gives every student a mentored research experience." },
      // MEDIUM
      { name: "Georgetown University", url: "https://www.georgetown.edu", type: "reach", region: "Mid-Atlantic", campusSize: "Medium", enrollment: 7500, testPolicy: "Test Optional", matchReasoning: "Georgetown's global focus and rigorous academics attract students with strong intellectual curiosity." },
      { name: "Boston College", url: "https://www.bc.edu", type: "reach", region: "Northeast", campusSize: "Medium", enrollment: 10000, testPolicy: "Test Optional", matchReasoning: "Boston College's Jesuit tradition of intellectual inquiry and service aligns with well-prepared students." },
      { name: "Tulane University", url: "https://www.tulane.edu", type: "match", region: "South", campusSize: "Medium", enrollment: 8500, testPolicy: "Test Optional", matchReasoning: "Tulane's service-learning requirement and vibrant campus culture appeal to engaged students." },
      { name: "Santa Clara University", url: "https://www.scu.edu", type: "match", region: "West", campusSize: "Medium", enrollment: 6000, testPolicy: "Test Optional", matchReasoning: "Santa Clara's Silicon Valley location and Jesuit values combine career preparation with ethical formation." },
      { name: "Marquette University", url: "https://www.marquette.edu", type: "safety", region: "Midwest", campusSize: "Medium", enrollment: 8000, testPolicy: "Test Optional", matchReasoning: "Marquette's strong professional programs and supportive community suit motivated students." },
      { name: "Villanova University", url: "https://www.villanova.edu", type: "match", region: "Mid-Atlantic", campusSize: "Medium", enrollment: 7000, testPolicy: "Test Optional", matchReasoning: "Villanova's Augustinian tradition and strong academics provide a values-centered education." },
      // LARGE
      { name: "University of Michigan", url: "https://www.umich.edu", type: "reach", region: "Midwest", campusSize: "Large", enrollment: 32000, testPolicy: "Test Optional", matchReasoning: "Michigan's research excellence and breadth of programs attract top students nationwide." },
      { name: "University of Virginia", url: "https://www.virginia.edu", type: "reach", region: "Mid-Atlantic", campusSize: "Large", enrollment: 17000, testPolicy: "Test Optional", matchReasoning: "UVA's student self-governance tradition and strong academics align with independent-minded students." },
      { name: "University of North Carolina", url: "https://www.unc.edu", type: "match", region: "South", campusSize: "Large", enrollment: 20000, testPolicy: "Test Optional", matchReasoning: "UNC's combination of public university resources and strong liberal arts tradition offers excellent value." },
      { name: "University of Washington", url: "https://www.washington.edu", type: "match", region: "West", campusSize: "Large", enrollment: 36000, testPolicy: "Test Optional", matchReasoning: "UW's research strength and Pacific Northwest setting attract students seeking academic excellence." },
      { name: "Boston University", url: "https://www.bu.edu", type: "match", region: "Northeast", campusSize: "Large", enrollment: 18000, testPolicy: "Test Optional", matchReasoning: "BU's urban campus and wide range of programs provide diverse academic and experiential opportunities." },
      { name: "University of Wisconsin", url: "https://www.wisc.edu", type: "safety", region: "Midwest", campusSize: "Large", enrollment: 35000, testPolicy: "Test Optional", matchReasoning: "Wisconsin's Big Ten experience and strong academics across disciplines make it a solid choice." },
      // MEGA
      { name: "Ohio State University", url: "https://www.osu.edu", type: "safety", region: "Midwest", campusSize: "Mega", enrollment: 47000, testPolicy: "Test Optional", matchReasoning: "Ohio State's breadth of programs and research opportunities offer extensive options for exploration." },
      { name: "Arizona State University", url: "https://www.asu.edu", type: "safety", region: "West", campusSize: "Mega", enrollment: 65000, testPolicy: "Test Optional", matchReasoning: "ASU's innovation-focused approach and wide range of programs provide accessible pathways." },
      { name: "University of Texas at Austin", url: "https://www.utexas.edu", type: "match", region: "South", campusSize: "Mega", enrollment: 42000, testPolicy: "Test Optional", matchReasoning: "UT Austin's top-ranked programs and vibrant campus culture attract strong students." },
      { name: "Penn State University", url: "https://www.psu.edu", type: "safety", region: "Mid-Atlantic", campusSize: "Mega", enrollment: 46000, testPolicy: "Test Optional", matchReasoning: "Penn State's extensive alumni network and comprehensive program offerings support many academic paths." },
      { name: "University of Minnesota", url: "https://www.umn.edu", type: "match", region: "Midwest", campusSize: "Mega", enrollment: 36000, testPolicy: "Test Optional", matchReasoning: "Minnesota's research strength and Twin Cities location combine academic rigor with urban opportunities." },
      // Additional match-tier schools (30–70% admit rate) for pool diversity
      { name: "University of Delaware", url: "https://www.udel.edu", type: "match", region: "Mid-Atlantic", campusSize: "Large", enrollment: 24000, testPolicy: "Test Optional", matchReasoning: "Delaware's strong academics and mid-Atlantic location provide a balanced university experience." },
      { name: "Drexel University", url: "https://www.drexel.edu", type: "match", region: "Mid-Atlantic", campusSize: "Large", enrollment: 16000, testPolicy: "Test Optional", matchReasoning: "Drexel's co-op program and urban Philadelphia setting prepare students for career success." },
      { name: "University of Vermont", url: "https://www.uvm.edu", type: "match", region: "Northeast", campusSize: "Medium", enrollment: 12000, testPolicy: "Test Optional", matchReasoning: "UVM's environmental focus and New England setting attract academically motivated students." },
      { name: "Baylor University", url: "https://www.baylor.edu", type: "match", region: "South", campusSize: "Large", enrollment: 20000, testPolicy: "Test Optional", matchReasoning: "Baylor's faith-based community and strong pre-professional programs support student development." },
      { name: "University of San Francisco", url: "https://www.usfca.edu", type: "match", region: "West", campusSize: "Medium", enrollment: 10000, testPolicy: "Test Optional", matchReasoning: "USF's Jesuit values and San Francisco location combine social justice with urban opportunity." },
      { name: "Miami University Ohio", url: "https://www.miamioh.edu", type: "match", region: "Midwest", campusSize: "Large", enrollment: 20000, testPolicy: "Test Optional", matchReasoning: "Miami Ohio's strong teaching reputation and residential campus create an engaged academic community." },
    ];

    const existingNames = new Set(analysis.recommendedSchools.map((s: any) => s.name));
    const sizeCats = ["Micro", "Small", "Medium", "Large", "Mega"];
    const regionCats = ["Northeast", "Mid-Atlantic", "South", "Midwest", "West"];

    for (const size of sizeCats) {
      const count = analysis.recommendedSchools.filter((s: any) => s.campusSize === size).length;
      if (count < 3) {
        const needed = 3 - count;
        const candidates = backupSchools.filter(s => s.campusSize === size && !existingNames.has(s.name));
        for (let i = 0; i < Math.min(needed, candidates.length); i++) {
          analysis.recommendedSchools.push(candidates[i]);
          existingNames.add(candidates[i].name);
        }
      }
    }

    for (const region of regionCats) {
      const count = analysis.recommendedSchools.filter((s: any) => s.region === region).length;
      if (count < 3) {
        const needed = 3 - count;
        const candidates = backupSchools.filter(s => s.region === region && !existingNames.has(s.name));
        for (let i = 0; i < Math.min(needed, candidates.length); i++) {
          analysis.recommendedSchools.push(candidates[i]);
          existingNames.add(candidates[i].name);
        }
      }
    }

    console.log("[Backup] Pool before enrichment:", analysis.recommendedSchools.length, "Micro:", analysis.recommendedSchools.filter((s: any) => s.campusSize === "Micro").length);

    try {
      const filledSchools = await fillGapsFromScorecard(analysis.recommendedSchools);
      analysis.recommendedSchools = filledSchools;
      console.log("[ScorecardFill] Pool before enrichment:", analysis.recommendedSchools.length, "schools");
    } catch (e) {
      console.log("[ScorecardFill] Failed, continuing with existing schools:", e);
    }

    // Enrich all schools with Scorecard data (test policy, odds) but do NOT reduce to 9
    const studentProfile = {
      testScores,
      gpa: analysis.recalculatedGPA,
      rigorScore: analysis.scorecard?.overallScore,
    };

    const enrichedPool = await Promise.race([
      enrichSchoolsWithScorecardData(analysis.recommendedSchools, studentProfile),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);

    if (enrichedPool) {
      analysis.recommendedSchools = enrichedPool;
      console.log("[Enrichment] Enriched pool:", analysis.recommendedSchools.length, "schools");
    } else {
      console.log("[Enrichment] Timeout, keeping unenriched pool");
    }

    // ── Final metadata re-correction + dedup ────────────
    if (analysis.recommendedSchools) {
      analysis.recommendedSchools = analysis.recommendedSchools.map((s) => {
        let fixed = s;
        if (fixed.enrollment && fixed.enrollment > 0) {
          const correctSize = getEnrollmentSize(fixed.enrollment);
          if (correctSize !== fixed.campusSize) fixed = { ...fixed, campusSize: correctSize };
        }
        const correctRegion = getSchoolRegion(fixed.name);
        if (correctRegion && correctRegion !== fixed.region) fixed = { ...fixed, region: correctRegion };
        if (isTestRequiredSchool(fixed.name) && fixed.testPolicy !== "Test Required") {
          fixed = { ...fixed, testPolicy: "Test Required" };
        }
        return fixed;
      });
      analysis.recommendedSchools = deduplicateByName(analysis.recommendedSchools);
      console.log(`[InitialPDF] Final: ${analysis.recommendedSchools.length} schools after all correction + dedup`);
    }

    // ── In-state admission boost for public universities ──────────────────
    const STATE_TO_PUBLIC_BOOST: Record<string, string[]> = {
      "VA": ["University of Virginia", "Virginia Tech", "James Madison University", "George Mason University", "Old Dominion University", "Virginia Commonwealth University", "College of William & Mary", "Christopher Newport University", "Radford University"],
      "MD": ["University of Maryland", "Towson University", "Salisbury University"],
      "PA": ["Penn State", "University of Pittsburgh", "Temple University"],
      "NC": ["University of North Carolina", "NC State", "Appalachian State"],
      "CA": ["University of California", "California State"],
      "NY": ["SUNY", "University at Buffalo"],
      "FL": ["University of Florida", "Florida State", "University of South Florida", "University of Central Florida"],
      "TX": ["University of Texas", "Texas A&M"],
      "GA": ["University of Georgia", "Georgia Institute of Technology"],
      "OH": ["Ohio State", "University of Cincinnati", "Miami University"],
      "MI": ["University of Michigan", "Michigan State"],
      "IL": ["University of Illinois"],
      "WI": ["University of Wisconsin"],
      "IN": ["Indiana University", "Purdue University"],
      "SC": ["University of South Carolina", "Clemson"],
      "TN": ["University of Tennessee"],
      "AL": ["University of Alabama"],
      "CO": ["University of Colorado", "Colorado State"],
      "OR": ["University of Oregon", "Oregon State"],
      "WA": ["University of Washington", "Washington State"],
      "AZ": ["University of Arizona", "Arizona State"],
      "MN": ["University of Minnesota"],
      "IA": ["University of Iowa", "Iowa State"],
      "MO": ["University of Missouri"],
    };

    if (homeState) {
      const boostNames = STATE_TO_PUBLIC_BOOST[homeState] || [];
      analysis.recommendedSchools = analysis.recommendedSchools.map((s: any) => {
        const nameMatch = boostNames.some(bn => s.name.includes(bn));
        if (nameMatch && s.acceptanceProbability !== undefined) {
          const orig = s.acceptanceProbability;
          s.acceptanceProbability = Math.min(95, Math.round(s.acceptanceProbability * 1.7));
          s.matchReasoning = "[In-State Advantage] " + s.matchReasoning;
          if (s.acceptanceProbability < 40) s.type = "reach";
          else if (s.acceptanceProbability >= 75) s.type = "safety";
          else s.type = "match";
          console.log("[InState] " + s.name + ": odds " + orig + "% → " + s.acceptanceProbability + "% (" + homeState + " resident)");
        }
        return s;
      });
    }

    // Reclassify ALL schools based on actual odds — this overrides any incorrect hardcoded types
    analysis.recommendedSchools = analysis.recommendedSchools.map((s: any) => {
      if (s.acceptanceProbability != null) {
        if (s.acceptanceProbability < 40) s.type = "reach";
        else if (s.acceptanceProbability >= 75) s.type = "safety";
        else s.type = "match";
      }
      return s;
    });

    // Then assign fallback odds to any remaining school without odds (LAST step)
    analysis.recommendedSchools = analysis.recommendedSchools.map((s: any) => {
      if (s.acceptanceProbability == null) {
        if (s.type === "reach") s.acceptanceProbability = 15;
        else if (s.type === "match") s.acceptanceProbability = 50;
        else if (s.type === "safety") s.acceptanceProbability = 85;
      }
      return s;
    });

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Analysis error:", error);

    // Always return valid JSON — never let Next.js fall through to an HTML
    // error page.
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error:
          "Document processing failed in the cloud environment. Please try refreshing or ensuring the files are standard PDFs.",
        detail: message,
      },
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
