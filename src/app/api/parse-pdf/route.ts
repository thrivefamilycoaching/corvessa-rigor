import "@ungap/with-resolvers";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { AnalysisResult, TestScores, RecommendedSchool } from "@/lib/types";
import { enrichSchoolsWithScorecardData, getEnrollmentSize, deduplicateByName, fillGapsFromScorecard } from "@/lib/scorecard";
import { isTestRequiredSchool, TEST_REQUIRED_SCHOOLS, getSchoolRegion } from "@/lib/constants";
import { SCHOOLS_DATABASE } from "@/lib/schoolDatabase";
import { isTop30Elite } from "@/lib/scorecard";
import { getServiceClient } from "@/lib/supabase";
import { hmacHash } from "@/lib/encryption";

// Disable all Vercel caching — always fetch fresh Scorecard data
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

/** Classify a school for a specific student based on admit rate, GPA, SAT, and leadership.
 *
 *  Methodology:
 *  1. Anchor to the school's actual acceptance rate.
 *  2. Compute a student quality score (-1.0 to +1.0) from GPA, SAT, and leadership.
 *  3. Map the quality score to a proportional adjustment that scales with the base rate:
 *     - At selective schools (low base), the upside room is smaller.
 *     - At accessible schools (high base), a strong student can approach 90%+.
 *  4. Enforce a hard ceiling so odds never go absurdly higher than the base rate. */
function classifyForStudent(
  admitRate: number,
  studentGPA: number,
  studentSAT: number | null,
  leadershipScore?: number
): { personalizedOdds: number; type: string } {
  const base = admitRate * 100;

  // ── Student quality score: range roughly -1.0 to +1.0 ──
  let q = 0;

  // GPA component (-0.5 to +0.4)
  if (studentGPA >= 3.9) q += 0.40;
  else if (studentGPA >= 3.7) q += 0.30;
  else if (studentGPA >= 3.5) q += 0.15;
  else if (studentGPA >= 3.0) q += 0;
  else if (studentGPA >= 2.5) q -= 0.20;
  else q -= 0.50;

  // SAT component (-0.4 to +0.35)
  if (studentSAT) {
    if (studentSAT >= 1500) q += 0.35;
    else if (studentSAT >= 1400) q += 0.25;
    else if (studentSAT >= 1300) q += 0.15;
    else if (studentSAT >= 1200) q += 0.05;
    else if (studentSAT >= 1000) q -= 0.10;
    else q -= 0.40;
  }

  // Leadership component (0 to +0.10)
  if (leadershipScore && leadershipScore > 0) {
    q += Math.min(0.10, leadershipScore * 0.012);
  }

  // Clamp quality score
  q = Math.max(-1.0, Math.min(1.0, q));

  // ── Map quality score to odds ──
  // Upside room (from base to ceiling) is limited; downside can go to near zero.
  //   ceiling = base + min(25, base × 0.8)
  //     UVA 19% → ceiling 34%,  JMU 76% → ceiling 95%,  50% school → ceiling 90%
  const ceiling = Math.min(95, base + Math.min(25, base * 0.8));
  const floor = Math.max(1, base * 0.15);

  let odds: number;
  if (q >= 0) {
    // Positive quality: interpolate from base toward ceiling
    odds = base + q * (ceiling - base);
  } else {
    // Negative quality: interpolate from base toward floor
    odds = base + q * (base - floor);
  }

  odds = Math.max(1, Math.round(odds));

  let type: string;
  if (odds < 30) type = "reach";
  else if (odds > 65) type = "safety";
  else type = "match";
  return { personalizedOdds: odds, type };
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
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  try {
    const formData = await request.formData();
    console.log(`[Timer] Request started`);

    // ── Access code authentication ──────────────────────────────────
    const accessCode = formData.get("accessCode") as string | null;
    if (!accessCode) {
      return NextResponse.json(
        { error: "Access code is required" },
        { status: 401 }
      );
    }

    const supabase = getServiceClient();
    const { data: codeData, error: codeError } = await supabase
      .from("access_codes")
      .select("analyses_remaining")
      .eq("code", hmacHash(accessCode.toUpperCase()))
      .single();

    if (codeError || !codeData) {
      return NextResponse.json(
        { error: "Invalid access code" },
        { status: 401 }
      );
    }

    if (codeData.analyses_remaining <= 0) {
      return NextResponse.json(
        { error: "No analyses remaining" },
        { status: 403 }
      );
    }

    // ── File validation ─────────────────────────────────────────────
    const schoolProfileFile = formData.get("schoolProfile") as File | null;
    const transcriptFile = formData.get("transcript") as File | null;

    // School can be identified by PDF upload OR by name (from dropdown)
    const schoolName = (formData.get("schoolName") as string) || null;
    const schoolCity = (formData.get("schoolCity") as string) || null;
    const schoolState = (formData.get("schoolState") as string) || null;

    if (!schoolProfileFile && !schoolName) {
      return NextResponse.json(
        { error: "Either a School Profile PDF or a school selection is required" },
        { status: 400 }
      );
    }

    if (!transcriptFile) {
      return NextResponse.json(
        { error: "Student Transcript is required" },
        { status: 400 }
      );
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (schoolProfileFile && schoolProfileFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "School profile file must be under 10MB" },
        { status: 400 }
      );
    }
    if (transcriptFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Transcript file must be under 10MB" },
        { status: 400 }
      );
    }

    if (schoolProfileFile && schoolProfileFile.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are accepted for school profile" },
        { status: 400 }
      );
    }
    if (transcriptFile.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are accepted for transcript" },
        { status: 400 }
      );
    }

    // Extract home state from formData (may not be sent by parent portal yet)
    const homeState = (formData.get("homeState") as string) || schoolState || null;

    // Extract test scores from formData
    const testScores: TestScores = {};
    const satReading = formData.get("satReading");
    const satMath = formData.get("satMath");
    const actComposite = formData.get("actComposite");

    if (satReading) testScores.satReading = parseInt(satReading as string);
    if (satMath) testScores.satMath = parseInt(satMath as string);
    if (actComposite) testScores.actComposite = parseInt(actComposite as string);

    // Extract activities text
    const activitiesText = (formData.get("activitiesText") as string) || "";

    // Extract manual GPA override and school count with validation
    const manualGPA = parseFloat((formData.get("manualGPA") as string) || "0");
    if (manualGPA < 0 || manualGPA > 5.0) {
      return NextResponse.json(
        { error: "GPA must be between 0.0 and 5.0" },
        { status: 400 }
      );
    }

    const schoolCount = parseInt((formData.get("schoolCount") as string) || "9");
    if (schoolCount < 1 || schoolCount > 30) {
      return NextResponse.json(
        { error: "School count must be between 1 and 30" },
        { status: 400 }
      );
    }

    // Extract text from PDFs (school profile is optional if school was selected from dropdown)
    console.log(`[Timer] ${elapsed()} — Starting PDF extraction`);
    const transcriptBuffer = Buffer.from(await transcriptFile.arrayBuffer());

    let schoolProfileText: string;
    let transcriptText: string;

    if (schoolProfileFile && schoolName) {
      // BOTH dropdown and PDF — use dropdown as the identity anchor, PDF for course details
      // Cap the PDF text to avoid excessively long prompts since the school is already identified
      const schoolProfileBuffer = Buffer.from(await schoolProfileFile.arrayBuffer());
      const [spText, tText] = await Promise.all([
        extractTextFromPDF(schoolProfileBuffer).then(trimPdfText),
        extractTextFromPDF(transcriptBuffer).then(trimPdfText),
      ]);
      const cappedProfileText = spText.length > 1500 ? spText.slice(0, 1500) + "\n[... remainder of school profile trimmed for efficiency]" : spText;
      schoolProfileText = `School: ${schoolName}${schoolCity ? `, ${schoolCity}` : ""}${schoolState ? `, ${schoolState}` : ""} (confirmed by user).\n\nDetailed course offerings from uploaded school profile:\n${cappedProfileText}`;
      transcriptText = tText;
      console.log(`[Timer] ${elapsed()} — PDF extraction complete (dropdown+PDF, profile: ${spText.length} chars capped to ${cappedProfileText.length})`);
    } else if (schoolProfileFile) {
      // PDF only — original flow
      const schoolProfileBuffer = Buffer.from(await schoolProfileFile.arrayBuffer());
      const [spText, tText] = await Promise.all([
        extractTextFromPDF(schoolProfileBuffer).then(trimPdfText),
        extractTextFromPDF(transcriptBuffer).then(trimPdfText),
      ]);
      schoolProfileText = spText;
      transcriptText = tText;
      console.log(`[Timer] ${elapsed()} — PDF extraction complete (PDF-only, profile: ${spText.length} chars)`);
    } else {
      // No PDF — generate synthetic profile from dropdown selection
      transcriptText = await extractTextFromPDF(transcriptBuffer).then(trimPdfText);
      schoolProfileText = `School: ${schoolName}${schoolCity ? `, ${schoolCity}` : ""}${schoolState ? `, ${schoolState}` : ""}.
Detailed course catalog not available — this school was selected from the national database.
Analyze based on your knowledge of this school's academic offerings, typical curriculum for a high school in ${schoolState || "this state"}, and the student's transcript.
Focus the gap analysis on whether the student appears to be taking the most rigorous courses available based on the progression shown in their transcript.`;
      console.log(`[Timer] ${elapsed()} — PDF extraction complete (dropdown-only, transcript: ${transcriptText.length} chars)`);
    }

    // When the school was identified via dropdown, the full 500+ school database
    // gets merged in later — so we only need 15 AI-generated seeds (cuts output
    // tokens roughly in half and speeds up the OpenAI call significantly).
    const aiSchoolCount = schoolName ? 15 : 30;
    const aiSchoolPerType = schoolName ? 5 : 10;

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 240_000, // 240-second hard timeout on all OpenAI calls
    });

    // Generate analysis using OpenAI
    console.log(`[Timer] ${elapsed()} — Starting OpenAI call (model: gpt-4o-mini)`);
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
              "matchReasoning": "<2-3 sentence explanation connecting the school's specific academic strengths to the student's transcript>",
              "programs": {
                "greekLife": <true if school has fraternities/sororities, false otherwise>,
                "rotc": <true if school offers Army, Navy, or Air Force ROTC, false otherwise>,
                "studyAbroad": <true if school offers organized study abroad programs, false otherwise>,
                "honorsCollege": <true if school has a dedicated honors college or honors program, false otherwise>,
                "coopInternship": <true if school has a formal co-op or internship program, false otherwise>,
                "preMed": <true if school offers a pre-med track or advising program, false otherwise>,
                "preLaw": <true if school offers a pre-law track or advising program, false otherwise>,
                "engineering": <true if school has an engineering school or ABET-accredited engineering programs, false otherwise>,
                "nursing": <true if school has a nursing school or BSN program, false otherwise>,
                "businessSchool": <true if school has an undergraduate business school or major, false otherwise>,
                "performingArts": <true if school has a performing arts program (theater, music, dance), false otherwise>,
                "ncaaDivision": "<DI|DII|DIII|None — the school's primary NCAA athletic division>"
              }
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
          "studentGradeLevel": "<9th|10th|11th|12th - the student's current grade level>"${activitiesText ? `,
          "activitiesAnalysis": {
            "categories": [
              {
                "name": "<category name e.g. Athletics, Arts, Academic, Community Service, Student Government, Work Experience, Publications & Media>",
                "activities": ["<activity name with role>"]
              }
            ],
            "leadershipScore": "<number 1-10, based on leadership roles, years of commitment, and breadth of involvement>",
            "summary": "<2-3 sentence summary of the student's extracurricular profile, highlighting strengths and leadership>"
          }` : ""}
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
        - Generate exactly ${aiSchoolCount} recommended colleges in the recommendedSchools array:
          * ${aiSchoolPerType} reach, ${aiSchoolPerType} match, ${aiSchoolPerType} safety
          * At least 2 schools per region (Northeast, Mid-Atlantic, South, Midwest, West)
          * At least 2 schools per size category (Micro, Small, Medium, Large, Mega)
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

        ABSOLUTE REQUIREMENT — PROGRAM DATA ACCURACY (CRITICAL):
        - Include the "programs" object for EVERY recommended school with accurate boolean flags and NCAA division.
        - greekLife: true if the school has active Greek fraternities/sororities (social or professional Greek organizations on campus).
        - rotc: true if the school hosts Army, Navy, or Air Force ROTC programs on campus.
        - studyAbroad: true if the school offers organized study abroad or semester exchange programs (most 4-year colleges do).
        - honorsCollege: true if the school has a dedicated Honors College or University Honors Program (not just honors sections of courses).
        - coopInternship: true if the school has a formal cooperative education or structured internship program (e.g., Northeastern, Drexel, Georgia Tech, Cincinnati).
        - preMed: true if the school offers a pre-medical advisory track or committee letter program.
        - preLaw: true if the school offers pre-law advising or a formal pre-law track.
        - engineering: true if the school has an engineering school, college of engineering, or ABET-accredited engineering degree programs.
        - nursing: true if the school offers a BSN or undergraduate nursing degree program.
        - businessSchool: true if the school has an undergraduate business school, business major, or commerce school.
        - performingArts: true if the school has BFA/BM programs or a dedicated performing arts department (theater, music, dance).
        - ncaaDivision: "DI", "DII", "DIII", or "None" — the school's primary NCAA athletic division. Most large state universities are DI. Many liberal arts colleges are DIII. Schools without NCAA athletics should be "None".
        - Be ACCURATE — do not guess. If unsure about a program, default to false (or "None" for NCAA).
        - EVERY school MUST include the complete "programs" object with ALL 12 fields (11 booleans + ncaaDivision). Do NOT omit the programs object for any school, even small or less-known colleges. If you are uncertain, set boolean flags to false.

        MATCH REASONING REQUIREMENTS (CRITICAL — NO GENERIC DESCRIPTIONS):
        - EVERY school MUST have a unique, personalized matchReasoning that references the SPECIFIC student's profile.
        - Reference the student's actual courses, GPA, strengths, interests, or extracurriculars in the explanation.
        - Explain WHY this school is a good fit for THIS student specifically, not just a generic school description.
        - BAD example: "Based on your academic profile, you have a 45% chance of admission." (TOO GENERIC — NEVER DO THIS)
        - BAD example: "A strong liberal arts college with good programs." (TOO GENERIC — NEVER DO THIS)
        - GOOD example: "Your AP Chemistry and AP Biology coursework aligns well with Emory's top-ranked pre-med program, and your 3.8 GPA puts you in their competitive range."
        - GOOD example: "With strong humanities courses and debate experience, Davidson's emphasis on writing-intensive seminars and civic engagement would be an excellent fit."
        - Connect to evidence from the student's course selections, extracurricular activities, or academic strengths
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
          * Reach: acceptanceProbability < 30%
          * Match: acceptanceProbability 30%-65%
          * Safety: acceptanceProbability > 65%
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

        ${activitiesText ? `ACTIVITIES & LEADERSHIP SCORING (when activities are provided):
        - Assign a leadershipScore from 1-10 based on:
          * Leadership roles (Captain, President, Editor-in-Chief = high value)
          * Years of commitment (4+ years in an activity = high dedication)
          * Breadth across categories (involvement in 3+ categories = well-rounded)
          * Depth of impact (founding organizations, community service hours)
        - Score guide: 1-3 = minimal involvement, 4-6 = solid participation, 7-8 = strong leader, 9-10 = exceptional
        - Group activities into their natural categories in the activitiesAnalysis output
        - Write a 2-3 sentence summary highlighting the student's extracurricular strengths` : ""}

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
${activitiesText ? `
---

STUDENT EXTRACURRICULAR ACTIVITIES:
${activitiesText}

Analyze these activities and include an activitiesAnalysis in your response.` : ""}

Provide your comprehensive rigor analysis in the specified JSON format.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    console.log(`[Timer] ${elapsed()} — OpenAI call complete`);
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Failed to generate analysis" },
        { status: 500 }
      );
    }

    const analysis = JSON.parse(content) as AnalysisResult;
    console.log(`[Timer] ${elapsed()} — Response parsed (${analysis.recommendedSchools?.length ?? 0} AI schools)`);

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

    // ── Leadership score boost for GPT-recommended schools ────────────
    // Additive bonus: up to +3 percentage points (not multiplicative)
    const leadershipScore = analysis.activitiesAnalysis?.leadershipScore || 0;
    if (leadershipScore > 0 && analysis.recommendedSchools) {
      const leaderBonus = Math.min(3, Math.round(leadershipScore * 0.4));
      analysis.recommendedSchools = analysis.recommendedSchools.map((s: any) => {
        if (s.acceptanceProbability != null) {
          s.acceptanceProbability = Math.min(95, Math.max(1, s.acceptanceProbability + leaderBonus));
        }
        return s;
      });
      console.log(`[Leadership] Applied leadership boost (+${leaderBonus}pp, score=${leadershipScore}) to GPT schools`);
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

    try {
      const filledSchools = await fillGapsFromScorecard(analysis.recommendedSchools);
      analysis.recommendedSchools = filledSchools;
      console.log("[ScorecardFill] Pool before enrichment:", analysis.recommendedSchools.length, "schools");
    } catch (e) {
      console.log("[ScorecardFill] Failed, continuing with existing schools:", e);
    }

    // Enrich all schools with Scorecard data (test policy, odds) but do NOT reduce to 9
    console.log(`[Timer] ${elapsed()} — Starting Scorecard enrichment`);
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
      console.log(`[Timer] ${elapsed()} — Enrichment complete (${analysis.recommendedSchools.length} schools)`);
    } else {
      console.log(`[Timer] ${elapsed()} — Enrichment timeout, keeping unenriched pool`);
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

    // ── Merge SCHOOLS_DATABASE into pool ────────────────────────────────
    console.log(`[Timer] ${elapsed()} — Starting database merge`);
    const gptNames = new Set(
      analysis.recommendedSchools.map((s: any) => s.name.toLowerCase())
    );
    const studentGPA = analysis.recalculatedGPA || 3.0;
    const studentSAT =
      testScores.satReading && testScores.satMath
        ? testScores.satReading + testScores.satMath
        : null;

    const rigorScore = analysis.scorecard?.overallScore || 0;
    const gpaStr = studentGPA.toFixed(1);

    function buildMatchReasoning(name: string, type: string, odds: number, size: string, region: string, admitRate: number): string {
      const sizeDesc: Record<string, string> = {
        Micro: "intimate campus with small class sizes",
        Small: "close-knit academic community",
        Medium: "mid-sized campus balancing personal attention with diverse offerings",
        Large: "large university with extensive academic programs and research opportunities",
        Mega: "major research university with wide-ranging programs and campus life",
      };
      const env = sizeDesc[size] || "diverse academic environment";
      const selectivity = admitRate < 0.15 ? "highly selective" : admitRate < 0.35 ? "selective" : admitRate < 0.60 ? "moderately selective" : "accessible";

      if (type === "safety") {
        return `With your ${gpaStr} GPA${rigorScore >= 60 ? " and strong course rigor" : ""}, you are well-positioned for ${name}'s ${selectivity} admissions. This ${env} in the ${region} offers a strong academic fit with a ${odds}% estimated chance of admission.`;
      } else if (type === "reach") {
        return `${name} is a ${selectivity} institution${rigorScore >= 70 ? " that values the kind of rigorous coursework reflected in your transcript" : ""}. This ${env} in the ${region} would be competitive for your profile, with a ${odds}% estimated chance of admission.`;
      } else {
        return `Your ${gpaStr} GPA${rigorScore >= 60 ? " and solid course rigor" : ""} align well with ${name}'s academic profile. This ${env} in the ${region} offers a ${odds}% estimated chance of admission.`;
      }
    }

    for (const rec of SCHOOLS_DATABASE) {
      if (gptNames.has(rec.name.toLowerCase())) continue;
      const { personalizedOdds, type } = classifyForStudent(
        rec.admitRate,
        studentGPA,
        studentSAT,
        leadershipScore
      );
      analysis.recommendedSchools.push({
        name: rec.name,
        url: rec.url,
        type: type as "reach" | "match" | "safety",
        region: rec.region as any,
        campusSize: rec.campusSize as any,
        enrollment: rec.enrollment,
        testPolicy: rec.testPolicy as any,
        acceptanceProbability: personalizedOdds,
        matchReasoning: buildMatchReasoning(rec.name, type, personalizedOdds, rec.campusSize, rec.region, rec.admitRate),
        state: rec.state,
        programs: rec.ncaaDivision && rec.ncaaDivision !== "None" ? { ncaaDivision: rec.ncaaDivision as any } : undefined,
      });
    }
    console.log(
      `[DBMerge] Pool after database merge: ${analysis.recommendedSchools.length} schools`
    );

    // ── Backfill state + NCAA division for all schools from database ────────
    const dbByName = new Map(SCHOOLS_DATABASE.map((r) => [r.name.toLowerCase(), r]));
    analysis.recommendedSchools = analysis.recommendedSchools.map((s: any) => {
      const dbRecord = dbByName.get(s.name.toLowerCase());
      if (dbRecord) {
        if (!s.state) s = { ...s, state: dbRecord.state };
        // Override AI NCAA division with database source of truth (skip "None" defaults)
        if (dbRecord.ncaaDivision && dbRecord.ncaaDivision !== "None") {
          s = {
            ...s,
            programs: {
              ...(s.programs || {}),
              ncaaDivision: dbRecord.ncaaDivision,
            },
          };
        }
      }
      return s;
    });

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
          // Additive in-state bonus: +12 percentage points (not a multiplier)
          s.acceptanceProbability = Math.min(95, s.acceptanceProbability + 12);
          s.matchReasoning = "[In-State Advantage] " + s.matchReasoning;
          if (s.acceptanceProbability < 30) s.type = "reach";
          else if (s.acceptanceProbability > 65) s.type = "safety";
          else s.type = "match";
          console.log("[InState] " + s.name + ": odds " + orig + "% → " + s.acceptanceProbability + "% (" + homeState + " resident)");
        }
        return s;
      });
    }

    // Reclassify ALL schools based on actual odds — this overrides any incorrect hardcoded types
    analysis.recommendedSchools = analysis.recommendedSchools.map((s: any) => {
      if (s.acceptanceProbability != null) {
        if (s.acceptanceProbability < 30) s.type = "reach";
        else if (s.acceptanceProbability > 65) s.type = "safety";
        else s.type = "match";
      }
      return s;
    });

    // ── Elite school safety net ──────────────────────────────────────────
    // Top-30 elite schools (sub-10% admit rate) must ALWAYS be Reach.
    // If AI hallucinated high odds or enrichment timed out, force correct values.
    // Also cap odds for any school in the database with admitRate < 0.15.
    const dbByNameLower = new Map(SCHOOLS_DATABASE.map((r) => [r.name.toLowerCase(), r]));
    analysis.recommendedSchools = analysis.recommendedSchools.map((s: any) => {
      // Check 1: ELITE_TOP_30 — always Reach, cap at 18%
      if (isTop30Elite(s.name)) {
        if (s.type !== "reach" || s.acceptanceProbability > 18) {
          console.log(`[EliteGuard] ${s.name}: was ${s.type}@${s.acceptanceProbability}% → reach@${Math.min(s.acceptanceProbability ?? 10, 18)}%`);
          s.acceptanceProbability = Math.min(s.acceptanceProbability ?? 10, 18);
          s.type = "reach";
        }
        return s;
      }
      // Check 2: Any school in DB with admitRate < 0.15 — cap at 25%, force Reach
      const dbRec = dbByNameLower.get(s.name.toLowerCase());
      if (dbRec && dbRec.admitRate < 0.15 && (s.type !== "reach" || s.acceptanceProbability > 25)) {
        console.log(`[EliteGuard] ${s.name}: admitRate=${dbRec.admitRate}, was ${s.type}@${s.acceptanceProbability}% → reach@${Math.min(s.acceptanceProbability ?? 15, 25)}%`);
        s.acceptanceProbability = Math.min(s.acceptanceProbability ?? 15, 25);
        s.type = "reach";
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

    // Ensure every school has a programs object with all boolean flags defaulted
    const DEFAULT_PROGRAMS = {
      greekLife: false, rotc: false, studyAbroad: false, honorsCollege: false,
      coopInternship: false, preMed: false, preLaw: false, engineering: false,
      nursing: false, businessSchool: false, performingArts: false, ncaaDivision: "None",
    };
    analysis.recommendedSchools = analysis.recommendedSchools.map((s: any) => ({
      ...s,
      programs: { ...DEFAULT_PROGRAMS, ...(s.programs || {}) },
    }));

    console.log(`[Timer] ${elapsed()} — Sending response (${analysis.recommendedSchools.length} total schools)`);
    return NextResponse.json(analysis);
  } catch (error) {
    console.error(`[Timer] ${elapsed()} — CAUGHT ERROR:`, error);

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
