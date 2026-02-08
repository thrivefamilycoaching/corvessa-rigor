import "@ungap/with-resolvers";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { AnalysisResult, TestScores, RecommendedSchool } from "@/lib/types";
import { enforce343Distribution, getEnrollmentSize, deduplicateByName } from "@/lib/scorecard";
import { isTestRequiredSchool, TEST_REQUIRED_SCHOOLS, getSchoolRegion } from "@/lib/constants";

// Disable all Vercel caching — always fetch fresh Scorecard data
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

    // Extract test scores from formData
    const testScores: TestScores = {};
    const satReading = formData.get("satReading");
    const satMath = formData.get("satMath");
    const actComposite = formData.get("actComposite");

    if (satReading) testScores.satReading = parseInt(satReading as string);
    if (satMath) testScores.satMath = parseInt(satMath as string);
    if (actComposite) testScores.actComposite = parseInt(actComposite as string);

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
          * Match: acceptanceProbability 40%-70%
          * Safety: acceptanceProbability > 70%
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

        STEP 0 — GRADE-LEVEL IDENTIFICATION (DO THIS FIRST):
        - Determine the student's current grade level from the transcript (9th, 10th, 11th, or 12th)
        - Only courses associated with the student's CURRENT or PREVIOUS grade years count as "taken"
        - Future-year courses (e.g., 11th-grade courses for a 10th grader) are NEVER "taken"

        FRESHMAN (9th GRADE) SPECIAL RULE:
        - A freshman transcript will contain VERY FEW courses (typically only 1 year of each subject)
        - Do NOT assume ANY prerequisites were taken. A freshman showing "Honors Biology" does NOT imply they took "Biology" first
        - The "taken" array for a freshman should be SHORT — typically 5-7 courses total
        - Any course NOT explicitly listed with a grade on the transcript is NOT taken, period
        - This rule applies regardless of how "obvious" the prerequisite seems

        STEP 1 — HARD MATCH "TAKEN" POLICY (CRITICAL):
        - A course is "taken" ONLY if its EXACT course title appears in the TRANSCRIPT PDF with an associated grade or mark
        - HARD MATCH means literal string matching — the course title on the transcript must match the course title in the school profile
        - Do NOT infer prerequisites. If the transcript shows "Integrated Math 2" but does NOT list "Integrated Math 1", then "Integrated Math 1" is NOT taken — even though the student logically must have completed it
        - Do NOT infer completion of earlier courses from later ones. "Algebra 2" on transcript does NOT mean "Algebra 1" was taken
        - Do NOT auto-fill foundational courses. Every "taken" entry must be backed by explicit text in the TRANSCRIPT PDF
        - If a course name is ambiguous or only partially matches, do NOT count it as taken
        - SOURCE ISOLATION: The School Profile tells you what is OFFERED. The Transcript tells you what is TAKEN. These are two completely separate data sources. Never copy a course from "offered" into "taken" unless the TRANSCRIPT independently confirms it with a grade

        STEP 2 — VERTICAL CURRICULUM MAPPING:
        - In "offered", list ALL courses in the subject's progression from lowest to highest from the SCHOOL PROFILE
        - Include ALL honors/accelerated/AP variants available at each level
        - Example for Math: ["Algebra 1", "Honors Algebra 1", "Geometry", "Honors Geometry", "Algebra 2", "Accelerated Algebra 2", "Precalculus", "Honors Precalculus", "Calculus 1", "Advanced Calculus 2", "AP Calculus AB", "AP Calculus BC"]

        STEP 3 — VALIDATION CHECK (MANDATORY BEFORE OUTPUT):
        - Before finalizing the "taken" array, cross-reference EVERY entry against the raw transcript text
        - If a course name does not appear in the raw transcript text, REMOVE it from "taken" and ADD it to "missed"
        - This is a hard gate — no exceptions

        STEP 3b — SANITY CHECK (HALLUCINATION GUARD):
        - For each subject, verify that no grade level has more than one core course marked as "taken"
        - Example: a student cannot take BOTH "Geometry" AND "Honors Geometry" in the same year — if both appear, re-check the transcript and keep only the one that actually appears with a grade
        - If you find duplicate courses at the same level, flag the discrepancy and keep only the version confirmed by the transcript
        - This prevents the model from inflating the "taken" list with phantom courses

        STEP 4 — MISSED / UPCOMING OPPORTUNITIES (CRITICAL):
        - ANY course listed in the School Profile's "offered" array that is NOT in the "taken" array MUST go into "missed"
        - For students below 12th grade, label these as upcoming opportunities (courses they can still take)
        - This includes:
          * Same-level rigor upgrades: student took "Geometry" but school offers "Honors Geometry" → flag "Honors Geometry"
          * Next-level courses: student completed "Algebra 2" and school offers "Precalculus" → flag "Precalculus"
          * All higher-track courses the student has not yet reached

        Rule A - SAME-LEVEL RIGOR CHECK:
        - If student took a Standard/Regular course when Honors/Accelerated version existed at SAME level, flag the Honors version
        - Example: Student took "Algebra 2" but school offers "Accelerated Algebra 2" → flag "Accelerated Algebra 2"

        Rule B - NEXT-LEVEL RIGOR CHECK:
        - Identify the next course in sequence that the student COULD take based on courses actually taken
        - If student completed "Accelerated Algebra 2" and school offers "Honors Precalculus" → flag "Honors Precalculus"

        Rule C - NEVER SAY "All rigorous options taken" UNLESS:
        - Student is taking the ABSOLUTE HIGHEST level course available in that subject's entire track at the school
        - The missed array must be NON-EMPTY for any student who is not at the absolute top course in each track

        Rule D - DO NOT FLAG as missed:
        - Courses requiring prerequisites the student hasn't actually taken (verified against transcript)
        - 11th/12th grade courses for 9th/10th graders (use grade-level from Step 0)
        - Courses outside the student's current sequence path

        APPLY CONSISTENTLY ACROSS ALL SUBJECTS:
        - Math, Science, English, Social Studies, Foreign Language must all follow the same logic
        - Include at least: Math, Science, English, Social Studies, Foreign Language

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

    // Enforce 3-3-3 distribution with Scorecard API enrichment + targeted fill
    const studentProfile = {
      testScores,
      gpa: analysis.recalculatedGPA,
      rigorScore: analysis.scorecard?.overallScore,
    };
    const studentDesc = [
      `Student Profile:`,
      `- GPA: ${analysis.recalculatedGPA ?? "N/A"} (weighted)`,
      `- Rigor Score: ${analysis.scorecard?.overallScore ?? "N/A"}/100`,
      testScores.satReading && testScores.satMath
        ? `- SAT: ${testScores.satReading + testScores.satMath}`
        : "",
      testScores.actComposite ? `- ACT: ${testScores.actComposite}` : "",
      `- School Context: ${analysis.schoolProfileSummary}`,
      `- Academic Summary: ${analysis.transcriptSummary}`,
    ]
      .filter(Boolean)
      .join("\n");

    // Race school enrichment against a 20-second budget.
    // If enrichment takes too long, return GPT-only recommendations so
    // the user never sees an HTML timeout page.
    const enrichmentPromise = enforce343Distribution(
      analysis.recommendedSchools,
      studentProfile,
      openai,
      studentDesc,
    );
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 20_000)
    );

    const enriched = await Promise.race([enrichmentPromise, timeoutPromise]);

    if (enriched) {
      analysis.recommendedSchools = enriched;
    } else {
      console.warn(
        "[Timeout] School enrichment exceeded 20 s — returning GPT-only schools"
      );
    }

    // ── Final metadata re-correction + dedup after enrichment ────────────
    // Belt-and-suspenders: ensure enrichment didn't introduce any metadata
    // drift and no duplicates slipped through.
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
      console.log(`[InitialPDF] Final: ${analysis.recommendedSchools.length} schools after post-enrichment correction`);
    }

    // BACKUP: Guarantee every size and region category has schools
    const backupSchools: RecommendedSchool[] = [
      { name: "Williams College", url: "https://www.williams.edu", type: "reach", region: "Northeast", campusSize: "Micro", enrollment: 2000, matchReasoning: "Williams' rigorous liberal arts curriculum and small class sizes align well with this student's strong academic foundation." },
      { name: "Colby College", url: "https://www.colby.edu", type: "match", region: "Northeast", campusSize: "Micro", enrollment: 2000, matchReasoning: "Colby's commitment to undergraduate research and global engagement align with this student's academic trajectory." },
      { name: "Bates College", url: "https://www.bates.edu", type: "safety", region: "Northeast", campusSize: "Micro", enrollment: 1800, matchReasoning: "Bates' test-optional policy and emphasis on experiential learning make it an accessible option." },
      { name: "Haverford College", url: "https://www.haverford.edu", type: "match", region: "Mid-Atlantic", campusSize: "Micro", enrollment: 1400, matchReasoning: "Haverford's honor code and close-knit academic community foster intellectual engagement." },
      { name: "Swarthmore College", url: "https://www.swarthmore.edu", type: "reach", region: "Mid-Atlantic", campusSize: "Micro", enrollment: 1600, matchReasoning: "Swarthmore's honors program and intellectual rigor attract students who thrive on academic challenge." },
      { name: "Rhodes College", url: "https://www.rhodes.edu", type: "safety", region: "South", campusSize: "Micro", enrollment: 2000, matchReasoning: "Rhodes' strong liberal arts tradition and Memphis location offer academics and community engagement." },
      { name: "Centre College", url: "https://www.centre.edu", type: "safety", region: "South", campusSize: "Micro", enrollment: 1500, matchReasoning: "Centre's guaranteed study abroad and high graduate school placement reflect its commitment to student success." },
      { name: "Grinnell College", url: "https://www.grinnell.edu", type: "match", region: "Midwest", campusSize: "Micro", enrollment: 1700, matchReasoning: "Grinnell's self-governed curriculum and strong mentorship suit students who take initiative." },
      { name: "Kenyon College", url: "https://www.kenyon.edu", type: "match", region: "Midwest", campusSize: "Micro", enrollment: 1700, matchReasoning: "Kenyon's renowned writing program and close faculty relationships foster deep academic engagement." },
      { name: "Pomona College", url: "https://www.pomona.edu", type: "reach", region: "West", campusSize: "Micro", enrollment: 1800, matchReasoning: "Pomona's intimate environment and Claremont Consortium access offer both depth and breadth." },
      { name: "Harvey Mudd College", url: "https://www.hmc.edu", type: "reach", region: "West", campusSize: "Micro", enrollment: 900, matchReasoning: "Harvey Mudd's STEM focus combined with liberal arts breadth suits analytically minded students." },
      { name: "Davidson College", url: "https://www.davidson.edu", type: "reach", region: "South", campusSize: "Small", enrollment: 2000, matchReasoning: "Davidson's honor code and rigorous academics attract students who thrive in challenging environments." },
      { name: "Bowdoin College", url: "https://www.bowdoin.edu", type: "reach", region: "Northeast", campusSize: "Small", enrollment: 2000, matchReasoning: "Bowdoin's commitment to the common good and strong science programs complement strong academic profiles." },
      { name: "Bucknell University", url: "https://www.bucknell.edu", type: "match", region: "Mid-Atlantic", campusSize: "Small", enrollment: 3800, matchReasoning: "Bucknell's blend of liberal arts and professional programs provides flexibility for exploration." },
      { name: "Whitman College", url: "https://www.whitman.edu", type: "match", region: "West", campusSize: "Small", enrollment: 1500, matchReasoning: "Whitman's discussion-based classes and research opportunities foster intellectual engagement." },
      { name: "Elon University", url: "https://www.elon.edu", type: "safety", region: "South", campusSize: "Small", enrollment: 4600, matchReasoning: "Elon's experiential learning focus and study abroad program suit well-rounded students." },
      { name: "College of Wooster", url: "https://www.wooster.edu", type: "safety", region: "Midwest", campusSize: "Small", enrollment: 2000, matchReasoning: "Wooster's Independent Study program gives every student a mentored research experience." },
      { name: "Georgetown University", url: "https://www.georgetown.edu", type: "reach", region: "Mid-Atlantic", campusSize: "Medium", enrollment: 7500, matchReasoning: "Georgetown's global focus and rigorous academics attract students with strong intellectual curiosity." },
      { name: "Boston College", url: "https://www.bc.edu", type: "reach", region: "Northeast", campusSize: "Medium", enrollment: 10000, matchReasoning: "Boston College's Jesuit tradition of intellectual inquiry and service aligns with well-prepared students." },
      { name: "Tulane University", url: "https://www.tulane.edu", type: "match", region: "South", campusSize: "Medium", enrollment: 8500, matchReasoning: "Tulane's service-learning requirement and vibrant campus culture appeal to engaged students." },
      { name: "Santa Clara University", url: "https://www.scu.edu", type: "match", region: "West", campusSize: "Medium", enrollment: 6000, matchReasoning: "Santa Clara's Silicon Valley location and Jesuit values combine career preparation with ethical formation." },
      { name: "Marquette University", url: "https://www.marquette.edu", type: "safety", region: "Midwest", campusSize: "Medium", enrollment: 8000, matchReasoning: "Marquette's strong professional programs and supportive community suit motivated students." },
      { name: "Villanova University", url: "https://www.villanova.edu", type: "match", region: "Mid-Atlantic", campusSize: "Medium", enrollment: 7000, matchReasoning: "Villanova's Augustinian tradition and strong academics provide a values-centered education." },
      { name: "University of Michigan", url: "https://www.umich.edu", type: "reach", region: "Midwest", campusSize: "Large", enrollment: 32000, matchReasoning: "Michigan's research excellence and breadth of programs attract top students nationwide." },
      { name: "University of Virginia", url: "https://www.virginia.edu", type: "reach", region: "Mid-Atlantic", campusSize: "Large", enrollment: 17000, matchReasoning: "UVA's student self-governance tradition and strong academics align with independent-minded students." },
      { name: "University of North Carolina", url: "https://www.unc.edu", type: "match", region: "South", campusSize: "Large", enrollment: 20000, matchReasoning: "UNC's combination of public university resources and strong liberal arts tradition offers excellent value." },
      { name: "University of Washington", url: "https://www.washington.edu", type: "match", region: "West", campusSize: "Large", enrollment: 36000, matchReasoning: "UW's research strength and Pacific Northwest setting attract students seeking academic excellence." },
      { name: "Boston University", url: "https://www.bu.edu", type: "match", region: "Northeast", campusSize: "Large", enrollment: 18000, matchReasoning: "BU's urban campus and wide range of programs provide diverse academic and experiential opportunities." },
      { name: "University of Wisconsin", url: "https://www.wisc.edu", type: "safety", region: "Midwest", campusSize: "Large", enrollment: 35000, matchReasoning: "Wisconsin's Big Ten experience and strong academics across disciplines make it a solid choice." },
      { name: "Ohio State University", url: "https://www.osu.edu", type: "safety", region: "Midwest", campusSize: "Mega", enrollment: 47000, matchReasoning: "Ohio State's breadth of programs and research opportunities offer extensive options for exploration." },
      { name: "Arizona State University", url: "https://www.asu.edu", type: "safety", region: "West", campusSize: "Mega", enrollment: 65000, matchReasoning: "ASU's innovation-focused approach and wide range of programs provide accessible pathways." },
      { name: "University of Texas at Austin", url: "https://www.utexas.edu", type: "match", region: "South", campusSize: "Mega", enrollment: 42000, matchReasoning: "UT Austin's top-ranked programs and vibrant campus culture attract strong students." },
      { name: "Penn State University", url: "https://www.psu.edu", type: "safety", region: "Mid-Atlantic", campusSize: "Mega", enrollment: 46000, matchReasoning: "Penn State's extensive alumni network and comprehensive program offerings support many academic paths." },
      { name: "University of Minnesota", url: "https://www.umn.edu", type: "match", region: "Midwest", campusSize: "Mega", enrollment: 36000, matchReasoning: "Minnesota's research strength and Twin Cities location combine academic rigor with urban opportunities." },
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

    console.log("[Backup] Final school count:", analysis.recommendedSchools.length, "Micro:", analysis.recommendedSchools.filter((s: any) => s.campusSize === "Micro").length);

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
