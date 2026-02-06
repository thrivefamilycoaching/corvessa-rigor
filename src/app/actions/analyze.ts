"use server";

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import OpenAI from "openai";
import type {
  RegionType,
  CampusSizeType,
  RecommendedSchool,
  AnalysisResult,
  FilteredRecommendationsRequest,
  TestScores,
} from "@/lib/types";

// Set the worker source to the local file — do NOT use CDN (blocked in Vercel serverless)
if (typeof pdfjs.GlobalWorkerOptions !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs"
  );
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
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
  } catch (error) {
    console.error("PDF parsing error:", error);
    throw new Error("Failed to parse PDF file. Please ensure it is a standard, non-encrypted PDF.");
  }
}

export async function analyzeDocuments(formData: FormData): Promise<AnalysisResult> {
  const schoolProfileFile = formData.get("schoolProfile") as File;
  const transcriptFile = formData.get("transcript") as File;

  if (!schoolProfileFile || !transcriptFile) {
    throw new Error("Both School Profile and Student Transcript are required");
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
    extractTextFromPDF(schoolProfileBuffer),
    extractTextFromPDF(transcriptBuffer),
  ]);

  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Generate analysis using OpenAI
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
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
        - Extract raw grades from the transcript for these academic core subjects ONLY:
          * Math (Algebra, Geometry, Precalculus, Calculus, Statistics, etc.)
          * Science (Biology, Chemistry, Physics, Environmental Science, etc.)
          * English (English 9-12, Literature, Composition, etc.)
          * Social Studies (History, Government, Economics, Psychology, etc.)
          * World Languages (Spanish, French, Latin, Mandarin, etc.)
        - Convert letter grades to the standard 4.0 scale: A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, C-=1.7, D+=1.3, D=1.0, F=0.0
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
        - Suggest 8-10 colleges that specifically value independent school rigor and challenging curricula
        - Include a mix of reach (3), match (4), and safety (3) schools
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
        - Typical ranges: Reach schools 5-25%, Match schools 30-65%, Safety schools 65-95%
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
        - First, determine the student's current grade level from their transcript (9th, 10th, 11th, or 12th grade)
        - For each subject, map the COMPLETE vertical curriculum track from the school profile

        VERTICAL CURRICULUM MAPPING (CRITICAL):
        - In "offered", list ALL courses in the subject's progression from lowest to highest
        - Include ALL honors/accelerated/AP variants available at each level
        - Example for Math: ["Algebra 1", "Honors Algebra 1", "Geometry", "Honors Geometry", "Algebra 2", "Accelerated Algebra 2", "Precalculus", "Honors Precalculus", "Calculus 1", "Advanced Calculus 2", "AP Calculus AB", "AP Calculus BC"]

        MISSED OPPORTUNITIES LOGIC (CRITICAL - READ CAREFULLY):

        Rule 1 - SAME-LEVEL RIGOR CHECK:
        - If student took a Standard/Regular course when Honors/Accelerated version existed at SAME level, flag the Honors version
        - Example: Student took "Geometry" but school offers "Honors Geometry" → flag "Honors Geometry"
        - Example: Student took "Algebra 2" but school offers "Accelerated Algebra 2" → flag "Accelerated Algebra 2"

        Rule 2 - NEXT-LEVEL RIGOR CHECK:
        - Identify the next course in sequence that the student COULD take based on prerequisites met
        - If student completed "Accelerated Algebra 2" and school offers "Honors Precalculus" → flag "Honors Precalculus"
        - If student completed "Honors Precalculus" and school offers "AP Calculus AB" → flag "AP Calculus AB"

        Rule 3 - NEVER SAY "All rigorous options taken" UNLESS:
        - Student is taking the ABSOLUTE HIGHEST level course available in that subject's entire track at the school
        - Example: Only say this for Math if student is in AP Calculus BC (the very top of the track)
        - If student is in "Accelerated Algebra 2" and school offers Honors Precalculus, Calculus, AP Calc → they have NOT taken all rigorous options → flag "Honors Precalculus" as the next logical missed opportunity
        - If student is in "Honors Chemistry" but school offers "AP Chemistry" → flag "AP Chemistry"
        - The missed array must be NON-EMPTY for any student who is not at the absolute top course in each track

        Rule 4 - DO NOT FLAG:
        - Courses requiring prerequisites the student hasn't completed
        - 11th/12th grade courses for 9th/10th graders
        - Courses outside the student's current sequence path

        APPLY CONSISTENTLY ACROSS ALL SUBJECTS:
        - Math, Science, English, Social Studies, Foreign Language must all follow the same logic
        - If you flag missed Honors options in Social Studies, you MUST also check for missed Honors options in Math, Science, etc.

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
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Failed to generate analysis");
  }

  try {
    const analysis = JSON.parse(content) as AnalysisResult;
    return analysis;
  } catch {
    throw new Error("Failed to parse analysis response");
  }
}

export async function getFilteredRecommendations(
  request: FilteredRecommendationsRequest
): Promise<RecommendedSchool[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Build region constraint (OR logic within regions)
  const regionConstraint = request.regions.length > 0 && request.regions.length < 5
    ? `IMPORTANT: Only recommend schools from these regions: ${request.regions.join(" OR ")}. Do NOT include schools from other regions.`
    : "Include schools from multiple regions for geographic diversity.";

  // Build size constraint (OR logic within sizes)
  const sizeDescriptions: Record<CampusSizeType, string> = {
    Micro: "under 2,000",
    Small: "2,000-5,000",
    Medium: "5,000-15,000",
    Large: "15,000-30,000",
    Mega: "30,000+",
  };

  const sizeConstraint = request.sizes.length > 0 && request.sizes.length < 5
    ? `IMPORTANT: Only recommend schools with these enrollment sizes: ${request.sizes.map(s => `${s} (${sizeDescriptions[s]})`).join(" OR ")}. Do NOT include schools outside these size ranges.`
    : "Include a mix of Micro, Small, Medium, Large, and Mega schools.";

  // Build policy constraint (OR logic within policies, but STRICT matching)
  const policyConstraint = request.policies.length > 0 && request.policies.length < 3
    ? `STRICT REQUIREMENT: Only recommend schools with these testing policies: ${request.policies.join(" OR ")}. Do NOT include schools with other testing policies. For example, if "Test Required" is specified, do NOT include Test Optional or Test Blind schools.`
    : "Include schools with various testing policies (Test Optional, Test Required, Test Blind).";

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert college admissions counselor. Based on a student's profile, recommend 8-10 colleges.

Return ONLY a JSON object with this structure:
{
  "schools": [
    {
      "name": "<college name>",
      "url": "<official college website URL, e.g., https://www.stanford.edu>",
      "type": "<reach|match|safety>",
      "region": "<Northeast|Mid-Atlantic|South|Midwest|West>",
      "campusSize": "<Micro|Small|Medium|Large|Mega>",
      "enrollment": <number>,
      "testPolicy": "<Test Optional|Test Required|Test Blind>",
      "acceptanceProbability": <number 1-95, exact percentage likelihood of acceptance>,
      "matchReasoning": "<2-3 sentences>"
    }
  ]
}

ACCEPTANCE PROBABILITY:
- Calculate an exact percentage for each school (integer, e.g., 62)
- Weigh GPA, rigor score, and test scores against each school's freshman profile
- Cap at 95% maximum, floor at 1% for Ivy-plus/ultra-selective schools
- Reach: typically 5-25%, Match: 30-65%, Safety: 65-95%

TEST POLICY DEFINITIONS:
- Test Optional: SAT/ACT scores considered if submitted but not required
- Test Required: SAT/ACT scores mandatory for all applicants
- Test Blind: SAT/ACT scores not considered even if submitted

REGION DEFINITIONS:
- Northeast: MA, NY, CT, RI, ME, VT, NH
- Mid-Atlantic: VA, DC, MD, PA, DE, NJ
- South: TX, GA, NC, FL, TN, SC, AL, LA
- Midwest: IL, MI, OH, WI, MN, IN, IA, MO
- West: CA, OR, WA, CO, AZ, UT, NV

SIZE DEFINITIONS:
- Micro: Under 2,000 undergraduates
- Small: 2,000-5,000 undergraduates
- Medium: 5,000-15,000 undergraduates
- Large: 15,000-30,000 undergraduates
- Mega: 30,000+ undergraduates

${regionConstraint}
${sizeConstraint}
${policyConstraint}

TEST SCORE WEIGHTING:
- If SAT or ACT scores are provided, use them to refine reach/match/safety categorization
- SAT Total 1500+ or ACT 34+: Student is competitive at highly selective schools
- SAT Total 1400-1499 or ACT 31-33: Student is competitive at very selective schools
- SAT Total 1300-1399 or ACT 28-30: Student is competitive at selective schools
- SAT Total 1200-1299 or ACT 24-27: Student is competitive at moderately selective schools
- For Test Required schools, weight test scores MORE heavily in categorization
- For Test Optional/Blind schools, weight course rigor MORE heavily

Include a mix of reach (3), match (4), and safety (3) schools.
Base recommendations on schools that value rigorous academic preparation.`,
      },
      {
        role: "user",
        content: `Student Profile:
- Rigor Score: ${request.overallScore}/100
${request.recalculatedGPA ? `- Recalculated Core GPA: ${request.recalculatedGPA}/4.0 (weighted)` : ""}
- School Context: ${request.schoolProfileSummary}
- Academic Summary: ${request.transcriptSummary}
${request.testScores?.satReading && request.testScores?.satMath ? `- SAT Score: ${request.testScores.satReading + request.testScores.satMath} (${request.testScores.satReading} R/W + ${request.testScores.satMath} Math)` : ""}
${request.testScores?.actComposite ? `- ACT Composite: ${request.testScores.actComposite}` : ""}

Provide college recommendations matching the specified filters. Include an exact acceptanceProbability (1-95%) for each school.${request.testScores?.satReading || request.testScores?.satMath || request.testScores?.actComposite ? " Use the test scores to refine reach/match/safety categorization and acceptance probability." : ""}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Failed to generate recommendations");
  }

  try {
    const result = JSON.parse(content) as { schools: RecommendedSchool[] };
    return result.schools;
  } catch {
    throw new Error("Failed to parse recommendations");
  }
}
