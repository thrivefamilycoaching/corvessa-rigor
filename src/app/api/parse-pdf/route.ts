import "@ungap/with-resolvers";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { AnalysisResult, TestScores } from "@/lib/types";
import { enforce343Distribution } from "@/lib/scorecard";

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
        - You MUST return EXACTLY 9 schools. No more, no fewer.
        - Categorize by acceptanceProbability: Safety (>70%), Match (40-70%), Reach (<40%). Distribution: 3 Safety, 3 Match, 3 Reach. No exceptions.
        - Specifically value independent school rigor and challenging curricula
        - Include "testPolicy" for each school: "Test Optional", "Test Required", or "Test Blind"
          * Test Optional: SAT/ACT scores considered if submitted but not required
          * Test Required: SAT/ACT scores mandatory for all applicants
          * Test Blind: SAT/ACT scores not considered even if submitted

        GEOGRAPHIC DIVERSITY (REQUIRED):
        - Include schools from at least 4 different US regions:
          * Northeast (e.g., Massachusetts, New York, Connecticut, Rhode Island, Maine, Vermont, New Hampshire)
          * Mid-Atlantic (e.g., Virginia, DC, Maryland, Pennsylvania, Delaware, New Jersey)
          * South (e.g., Texas, Georgia, North Carolina, Florida, Tennessee, South Carolina)
          * Midwest (e.g., Illinois, Michigan, Ohio, Wisconsin, Minnesota, Indiana)
          * West (e.g., California, Oregon, Washington, Colorado, Arizona)
        - Do NOT recommend more than 2 schools from any single state

        CAMPUS SIZE DIVERSITY (REQUIRED):
        - Include a mix of campus sizes:
          * Micro: Under 2,000 undergraduates (e.g., Amherst, Williams, Pomona, Swarthmore)
          * Small: 2,000-5,000 undergraduates (e.g., Carleton, Davidson, Bowdoin, Middlebury)
          * Medium: 5,000-15,000 undergraduates (e.g., Wake Forest, Tulane, Georgetown, Boston College)
          * Large: 15,000-30,000 undergraduates (e.g., Michigan, UCLA, UNC, Virginia)
          * Mega: 30,000+ undergraduates (e.g., Ohio State, UT Austin, Penn State, Arizona State)

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

        STEP 1 — ZERO-INFERENCE "TAKEN" POLICY (CRITICAL):
        - A course is "taken" ONLY if its EXACT name (or a clear abbreviation) appears in the raw transcript text with an associated grade or mark
        - Do NOT infer prerequisites. If the transcript shows "Algebra 2" but does NOT list "Algebra 1", then "Algebra 1" is NOT taken — even though the student must have completed it
        - Do NOT auto-fill foundational courses. Every "taken" entry must be backed by explicit text in the PDF
        - If a course name is ambiguous or partially matches, do NOT count it as taken

        STEP 2 — VERTICAL CURRICULUM MAPPING:
        - In "offered", list ALL courses in the subject's progression from lowest to highest from the SCHOOL PROFILE
        - Include ALL honors/accelerated/AP variants available at each level
        - Example for Math: ["Algebra 1", "Honors Algebra 1", "Geometry", "Honors Geometry", "Algebra 2", "Accelerated Algebra 2", "Precalculus", "Honors Precalculus", "Calculus 1", "Advanced Calculus 2", "AP Calculus AB", "AP Calculus BC"]

        STEP 3 — VALIDATION CHECK (MANDATORY BEFORE OUTPUT):
        - Before finalizing the "taken" array, cross-reference EVERY entry against the raw transcript text
        - If a course name does not appear in the raw transcript text, REMOVE it from "taken"
        - This is a hard gate — no exceptions

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
