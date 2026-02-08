"use server";

import { PDFParse } from "pdf-parse";
import OpenAI from "openai";
import type {
  AnalysisResult,
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

  const schoolProfileBuffer = Buffer.from(await schoolProfileFile.arrayBuffer());
  const transcriptBuffer = Buffer.from(await transcriptFile.arrayBuffer());

  const [schoolProfileText, transcriptText] = await Promise.all([
    extractTextFromPDF(schoolProfileBuffer),
    extractTextFromPDF(transcriptBuffer),
  ]);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

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
      "recommendedSchools": [ ... ],
      "gapAnalysis": [
        {
          "subject": "<subject area like Math, Science, English, etc>",
          "offered": ["<courses offered by school>"],
          "taken": ["<courses student took>"],
          "missed": ["<rigorous courses available but not taken>"]
        }
      ]
    }

    Categories to evaluate for scorecard:
    1. AP/IB Course Load (0-25): How many advanced courses relative to availability
    2. Honors Course Selection (0-20): Honors courses taken when AP not available
    3. Core Subject Rigor (0-25): Rigor in Math, Science, English, Social Studies
    4. Foreign Language Depth (0-15): Years and level of foreign language study
    5. Academic Progression (0-15): Trend showing increasing challenge over time

    RECOMMENDED SCHOOLS — THIS IS CRITICAL:
    Generate EXACTLY 30 colleges in the recommendedSchools array. Each school object must have:
    {
      "name": "<college name>",
      "url": "<official college website URL>",
      "type": "<reach|match|safety>",
      "region": "<Northeast|Mid-Atlantic|South|Midwest|West>",
      "campusSize": "<Micro|Small|Medium|Large|Mega>",
      "enrollment": <approximate undergraduate enrollment number>,
      "matchReasoning": "<2-3 sentence explanation>"
    }

    DISTRIBUTION REQUIREMENTS FOR THE 30 SCHOOLS:
    - Exactly 10 reach, 10 match, 10 safety
    - AT LEAST 2 Micro schools (under 2,000 students, e.g., Amherst, Williams, Pomona, Swarthmore, Harvey Mudd, Claremont McKenna, Grinnell, Haverford, Colby, Bates)
    - AT LEAST 2 Small schools (2,000-5,000 students, e.g., Carleton, Davidson, Bowdoin, Middlebury, Bucknell, Lafayette, Whitman, Rhodes)
    - AT LEAST 2 Medium schools (5,000-15,000 students, e.g., Wake Forest, Tulane, Georgetown, Boston College, Villanova, Santa Clara, Elon)
    - AT LEAST 2 Large schools (15,000-30,000 students, e.g., Michigan, UCLA, UNC, Virginia, Georgia Tech, Wisconsin)
    - AT LEAST 2 Mega schools (30,000+ students, e.g., Ohio State, UT Austin, Penn State, Arizona State, Florida, Texas A&M)
    - AT LEAST 4 schools from Northeast (MA, NY, CT, RI, ME, VT, NH)
    - AT LEAST 4 schools from Mid-Atlantic (VA, DC, MD, PA, DE, NJ)
    - AT LEAST 4 schools from South (TX, GA, NC, FL, TN, SC, AL, LA)
    - AT LEAST 4 schools from Midwest (IL, MI, OH, WI, MN, IN, IA, MO)
    - AT LEAST 4 schools from West (CA, OR, WA, CO, AZ, UT, NV)
    - Do NOT recommend more than 3 schools from any single state

    The campusSize field MUST accurately reflect each school's actual undergraduate enrollment:
    - Micro: Under 2,000
    - Small: 2,000-5,000
    - Medium: 5,000-15,000
    - Large: 15,000-30,000
    - Mega: 30,000+

    MATCH REASONING REQUIREMENTS:
    - Base reasoning on how the school's SPECIFIC academic strengths align with the student's transcript
    - Reference the school's notable programs, departments, or academic culture
    - Connect to evidence from the student's course selections
    - For independent/prep school students, mention schools known to value rigorous secondary preparation

    For gapAnalysis:
    - Compare what the school offers vs what the student took in each major subject area
    - Identify rigorous courses (AP, IB, Honors) that were available but not taken
    - Include at least: Math, Science, English, Social Studies, Foreign Language

    The narrative should be written in a professional tone suitable for a counselor letter,
    highlighting the student's academic choices in context of what the school offers.`,
      },
      {
        role: "user",
        content: `Please analyze the following documents:

SCHOOL PROFILE:
${schoolProfileText}

STUDENT TRANSCRIPT:
${transcriptText}

Provide your comprehensive rigor analysis in the specified JSON format. Remember: the recommendedSchools array MUST contain exactly 30 schools (10 reach, 10 match, 10 safety) with broad coverage across all 5 regions and all 5 size categories.`,
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
