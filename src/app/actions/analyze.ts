"use server";

import { PDFParse } from "pdf-parse";
import OpenAI from "openai";
import type {
  RegionType,
  CampusSizeType,
  RecommendedSchool,
  AnalysisResult,
  FilteredRecommendationsRequest,
} from "@/lib/types";

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  } catch (error) {
    console.error("PDF parsing error:", error);
    throw new Error("Failed to parse PDF file");
  }
}

export async function analyzeDocuments(formData: FormData): Promise<AnalysisResult> {
  const schoolProfileFile = formData.get("schoolProfile") as File;
  const transcriptFile = formData.get("transcript") as File;

  if (!schoolProfileFile || !transcriptFile) {
    throw new Error("Both School Profile and Student Transcript are required");
  }

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

        Categories to evaluate for scorecard:
        1. AP/IB Course Load (0-25): How many advanced courses relative to availability
        2. Honors Course Selection (0-20): Honors courses taken when AP not available
        3. Core Subject Rigor (0-25): Rigor in Math, Science, English, Social Studies
        4. Foreign Language Depth (0-15): Years and level of foreign language study
        5. Academic Progression (0-15): Trend showing increasing challenge over time

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

        For gapAnalysis:
        - First, determine the student's current grade level from their transcript (9th, 10th, 11th, or 12th grade)
        - For each subject, map the COMPLETE vertical curriculum track from the school profile

        VERTICAL CURRICULUM MAPPING (CRITICAL):
        - In "offered", list ALL courses in the subject's progression (e.g., Algebra 1 → Geometry → Algebra 2 → Precalculus → Calculus)
        - Include ALL honors/accelerated/AP variants available at each level
        - Example for Math: ["Algebra 1", "Honors Algebra 1", "Geometry", "Honors Geometry", "Algebra 2", "Accelerated Algebra 2", "Precalculus", "Honors Precalculus", "Calculus 1", "Advanced Calculus 2", "AP Calculus AB", "AP Calculus BC"]

        PREREQUISITE-AWARE MISSED OPPORTUNITIES (CRITICAL):
        - Only flag the NEXT logical rigorous step the student could have taken but didn't
        - If student took "Accelerated Algebra 2", check if "Honors Precalculus" was available - if yes, flag it
        - Do NOT flag "Advanced Calculus 2" if the student hasn't completed "Calculus 1" yet
        - Do NOT say "All rigorous options taken" unless the student is at the TOP of the available track
        - Example: A student in "Accelerated Algebra 2" has NOT taken all rigorous options if the school offers Honors Precalculus, AP Calculus AB, etc.

        GRADE-LEVEL AWARENESS:
        - Consider what courses the student COULD have taken by their current grade
        - A 10th grader cannot be penalized for not taking senior-level courses
        - But a 10th grader CAN be flagged for taking regular Geometry instead of Honors Geometry if available

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
      "matchReasoning": "<2-3 sentences>"
    }
  ]
}

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

Include a mix of reach (3), match (4), and safety (3) schools.
Base recommendations on schools that value rigorous academic preparation.`,
      },
      {
        role: "user",
        content: `Student Profile:
- Rigor Score: ${request.overallScore}/100
- School Context: ${request.schoolProfileSummary}
- Academic Summary: ${request.transcriptSummary}

Provide college recommendations matching the specified filters.`,
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
