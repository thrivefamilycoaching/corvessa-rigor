"use server";

import { PDFParse } from "pdf-parse";
import OpenAI from "openai";
import type {
  AnalysisResult,
  RecommendedSchool,
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
      "matchReasoning": "<2-3 sentence explanation>",
      "programs": {
        "greekLife": <boolean — true if school has fraternities/sororities>,
        "rotc": <boolean — true if school offers ROTC>,
        "studyAbroad": <boolean — true if school offers study abroad programs>,
        "honorsCollege": <boolean — true if school has a dedicated honors college or program>,
        "coopInternship": <boolean — true if school has a formal co-op or internship program>,
        "preMed": <boolean — true if school offers pre-med advising>,
        "preLaw": <boolean — true if school offers pre-law advising>,
        "engineering": <boolean — true if school has engineering programs>,
        "nursing": <boolean — true if school has a BSN/nursing program>,
        "businessSchool": <boolean — true if school has undergraduate business programs>,
        "performingArts": <boolean — true if school has performing arts programs>,
        "ncaaDivision": "<DI|DII|DIII|None>"
      }
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

    PROGRAM DATA REQUIREMENTS:
    - Include the "programs" object for EVERY recommended school.
    - greekLife: true if school has active Greek fraternities/sororities.
    - rotc: true if school hosts Army, Navy, or Air Force ROTC on campus.
    - studyAbroad: true if school offers organized study abroad programs.
    - honorsCollege: true if school has a dedicated Honors College or Honors Program.
    - coopInternship: true if school has a formal co-op or structured internship program.
    - preMed: true if school has a pre-med track or advisory committee.
    - preLaw: true if school offers pre-law advising or track.
    - engineering: true if school has an engineering school or ABET-accredited programs.
    - nursing: true if school offers a BSN or undergraduate nursing degree.
    - businessSchool: true if school has an undergraduate business school or major.
    - performingArts: true if school has BFA/BM programs or performing arts department.
    - ncaaDivision: "DI", "DII", "DIII", or "None" for the school's NCAA division.
    - Default to false (or "None") if unsure.
    - EVERY school MUST include the complete "programs" object with ALL 12 fields. Do NOT omit programs for any school.

    MATCH REASONING REQUIREMENTS (CRITICAL — NO GENERIC DESCRIPTIONS):
    - EVERY school MUST have a unique, personalized matchReasoning that references the SPECIFIC student's profile.
    - Reference the student's actual courses, GPA, strengths, interests, or extracurriculars in the explanation.
    - Explain WHY this school is a good fit for THIS student specifically.
    - BAD: "Based on your academic profile, you have a 45% chance." or "A strong liberal arts college." (TOO GENERIC)
    - GOOD: "Your AP Chemistry and AP Biology coursework aligns with Emory's top-ranked pre-med program."
    - Connect to evidence from the student's course selections, extracurricular activities, or academic strengths
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
    console.log("GPT schools count:", analysis.recommendedSchools.length, "Micro:", analysis.recommendedSchools.filter((s: any) => s.campusSize === "Micro").length);

    // ── Post-processing: guarantee every size and region has schools ──
    const backupSchools: RecommendedSchool[] = [
      // MICRO - Northeast
      { name: "Williams College", url: "https://www.williams.edu", type: "reach", region: "Northeast", campusSize: "Micro", enrollment: 2000, matchReasoning: "Williams' rigorous liberal arts curriculum and small class sizes align well with this student's strong academic foundation.", programs: { greekLife: false, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DIII" } },
      { name: "Colby College", url: "https://www.colby.edu", type: "match", region: "Northeast", campusSize: "Micro", enrollment: 2000, matchReasoning: "Colby's commitment to undergraduate research and global engagement align with this student's academic trajectory.", programs: { greekLife: false, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DIII" } },
      { name: "Bates College", url: "https://www.bates.edu", type: "safety", region: "Northeast", campusSize: "Micro", enrollment: 1800, matchReasoning: "Bates' test-optional policy and emphasis on experiential learning make it an accessible option that values holistic preparation.", programs: { greekLife: false, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DIII" } },
      // MICRO - Mid-Atlantic
      { name: "Haverford College", url: "https://www.haverford.edu", type: "match", region: "Mid-Atlantic", campusSize: "Micro", enrollment: 1400, matchReasoning: "Haverford's honor code and close-knit academic community foster intellectual engagement.", programs: { greekLife: false, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DIII" } },
      { name: "Swarthmore College", url: "https://www.swarthmore.edu", type: "reach", region: "Mid-Atlantic", campusSize: "Micro", enrollment: 1600, matchReasoning: "Swarthmore's honors program and intellectual rigor attract students who thrive on academic challenge.", programs: { greekLife: false, rotc: false, studyAbroad: true, honorsCollege: true, coopInternship: false, preMed: true, preLaw: true, engineering: true, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DIII" } },
      // MICRO - South
      { name: "Rhodes College", url: "https://www.rhodes.edu", type: "safety", region: "South", campusSize: "Micro", enrollment: 2000, matchReasoning: "Rhodes' strong liberal arts tradition and Memphis location offer academics and community engagement.", programs: { greekLife: true, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: true, performingArts: true, ncaaDivision: "DIII" } },
      { name: "Centre College", url: "https://www.centre.edu", type: "safety", region: "South", campusSize: "Micro", enrollment: 1500, matchReasoning: "Centre's guaranteed study abroad and high graduate school placement reflect its commitment to student success.", programs: { greekLife: true, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DIII" } },
      // MICRO - Midwest
      { name: "Grinnell College", url: "https://www.grinnell.edu", type: "match", region: "Midwest", campusSize: "Micro", enrollment: 1700, matchReasoning: "Grinnell's self-governed curriculum and strong mentorship suit students who take initiative.", programs: { greekLife: false, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DIII" } },
      { name: "Kenyon College", url: "https://www.kenyon.edu", type: "match", region: "Midwest", campusSize: "Micro", enrollment: 1700, matchReasoning: "Kenyon's renowned writing program and close faculty relationships foster deep academic engagement.", programs: { greekLife: true, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DIII" } },
      // MICRO - West
      { name: "Pomona College", url: "https://www.pomona.edu", type: "reach", region: "West", campusSize: "Micro", enrollment: 1800, matchReasoning: "Pomona's intimate environment and Claremont Consortium access offer both depth and breadth.", programs: { greekLife: false, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DIII" } },
      { name: "Harvey Mudd College", url: "https://www.hmc.edu", type: "reach", region: "West", campusSize: "Micro", enrollment: 900, matchReasoning: "Harvey Mudd's STEM focus combined with liberal arts breadth suits analytically minded students.", programs: { greekLife: false, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: false, engineering: true, nursing: false, businessSchool: false, performingArts: false, ncaaDivision: "DIII" } },
      // SMALL - spread across regions
      { name: "Davidson College", url: "https://www.davidson.edu", type: "reach", region: "South", campusSize: "Small", enrollment: 2000, matchReasoning: "Davidson's honor code and rigorous academics attract students who thrive in challenging environments.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DI" } },
      { name: "Bowdoin College", url: "https://www.bowdoin.edu", type: "reach", region: "Northeast", campusSize: "Small", enrollment: 2000, matchReasoning: "Bowdoin's commitment to the common good and strong science programs complement strong academic profiles.", programs: { greekLife: false, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DIII" } },
      { name: "Bucknell University", url: "https://www.bucknell.edu", type: "match", region: "Mid-Atlantic", campusSize: "Small", enrollment: 3800, matchReasoning: "Bucknell's blend of liberal arts and professional programs provides flexibility for exploration.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: false, preMed: true, preLaw: true, engineering: true, nursing: false, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "Whitman College", url: "https://www.whitman.edu", type: "match", region: "West", campusSize: "Small", enrollment: 1500, matchReasoning: "Whitman's discussion-based classes and research opportunities foster intellectual engagement.", programs: { greekLife: true, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: false, performingArts: true, ncaaDivision: "DIII" } },
      { name: "Elon University", url: "https://www.elon.edu", type: "safety", region: "South", campusSize: "Small", enrollment: 4600, matchReasoning: "Elon's experiential learning focus and study abroad program suit well-rounded students.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "College of Wooster", url: "https://www.wooster.edu", type: "safety", region: "Midwest", campusSize: "Small", enrollment: 2000, matchReasoning: "Wooster's Independent Study program gives every student a mentored research experience.", programs: { greekLife: true, rotc: false, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: false, businessSchool: true, performingArts: true, ncaaDivision: "DIII" } },
      // MEDIUM - spread across regions
      { name: "Georgetown University", url: "https://www.georgetown.edu", type: "reach", region: "Mid-Atlantic", campusSize: "Medium", enrollment: 7500, matchReasoning: "Georgetown's global focus and rigorous academics attract students with strong intellectual curiosity.", programs: { greekLife: false, rotc: true, studyAbroad: true, honorsCollege: false, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "Boston College", url: "https://www.bc.edu", type: "reach", region: "Northeast", campusSize: "Medium", enrollment: 10000, matchReasoning: "Boston College's Jesuit tradition of intellectual inquiry and service aligns with well-prepared students.", programs: { greekLife: false, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: false, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "Tulane University", url: "https://www.tulane.edu", type: "match", region: "South", campusSize: "Medium", enrollment: 8500, matchReasoning: "Tulane's service-learning requirement and vibrant campus culture appeal to engaged students.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: false, preMed: true, preLaw: true, engineering: true, nursing: false, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "Santa Clara University", url: "https://www.scu.edu", type: "match", region: "West", campusSize: "Medium", enrollment: 6000, matchReasoning: "Santa Clara's Silicon Valley location and Jesuit values combine career preparation with ethical formation.", programs: { greekLife: false, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: false, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "Marquette University", url: "https://www.marquette.edu", type: "safety", region: "Midwest", campusSize: "Medium", enrollment: 8000, matchReasoning: "Marquette's strong professional programs and supportive community suit motivated students.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "Villanova University", url: "https://www.villanova.edu", type: "match", region: "Mid-Atlantic", campusSize: "Medium", enrollment: 7000, matchReasoning: "Villanova's Augustinian tradition and strong academics provide a values-centered education.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      // LARGE - spread across regions
      { name: "University of Michigan", url: "https://www.umich.edu", type: "reach", region: "Midwest", campusSize: "Large", enrollment: 32000, matchReasoning: "Michigan's research excellence and breadth of programs attract top students nationwide.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "University of Virginia", url: "https://www.virginia.edu", type: "reach", region: "Mid-Atlantic", campusSize: "Large", enrollment: 17000, matchReasoning: "UVA's student self-governance tradition and strong academics align with independent-minded students.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: false, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "University of North Carolina", url: "https://www.unc.edu", type: "match", region: "South", campusSize: "Large", enrollment: 20000, matchReasoning: "UNC's combination of public university resources and strong liberal arts tradition offers excellent value.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: false, preMed: true, preLaw: true, engineering: false, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "University of Washington", url: "https://www.washington.edu", type: "match", region: "West", campusSize: "Large", enrollment: 36000, matchReasoning: "UW's research strength and Pacific Northwest setting attract students seeking academic excellence.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "Boston University", url: "https://www.bu.edu", type: "match", region: "Northeast", campusSize: "Large", enrollment: 18000, matchReasoning: "BU's urban campus and wide range of programs provide diverse academic and experiential opportunities.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "University of Wisconsin", url: "https://www.wisc.edu", type: "safety", region: "Midwest", campusSize: "Large", enrollment: 35000, matchReasoning: "Wisconsin's Big Ten experience and strong academics across disciplines make it a solid choice.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      // MEGA - spread across regions
      { name: "Ohio State University", url: "https://www.osu.edu", type: "safety", region: "Midwest", campusSize: "Mega", enrollment: 47000, matchReasoning: "Ohio State's breadth of programs and research opportunities offer extensive options for exploration.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "Arizona State University", url: "https://www.asu.edu", type: "safety", region: "West", campusSize: "Mega", enrollment: 65000, matchReasoning: "ASU's innovation-focused approach and wide range of programs provide accessible pathways.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "University of Texas at Austin", url: "https://www.utexas.edu", type: "match", region: "South", campusSize: "Mega", enrollment: 42000, matchReasoning: "UT Austin's top-ranked programs and vibrant campus culture attract strong students from diverse backgrounds.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "Penn State University", url: "https://www.psu.edu", type: "safety", region: "Mid-Atlantic", campusSize: "Mega", enrollment: 46000, matchReasoning: "Penn State's extensive alumni network and comprehensive program offerings support many academic paths.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
      { name: "University of Minnesota", url: "https://www.umn.edu", type: "match", region: "Midwest", campusSize: "Mega", enrollment: 36000, matchReasoning: "Minnesota's research strength and Twin Cities location combine academic rigor with urban opportunities.", programs: { greekLife: true, rotc: true, studyAbroad: true, honorsCollege: true, coopInternship: true, preMed: true, preLaw: true, engineering: true, nursing: true, businessSchool: true, performingArts: true, ncaaDivision: "DI" } },
    ];

    const sizes = ["Micro", "Small", "Medium", "Large", "Mega"];
    const regions = ["Northeast", "Mid-Atlantic", "South", "Midwest", "West"];
    const existingNames = new Set(analysis.recommendedSchools.map(s => s.name));

    for (const size of sizes) {
      const countForSize = analysis.recommendedSchools.filter(s => s.campusSize === size).length;
      if (countForSize < 3) {
        const needed = 3 - countForSize;
        const candidates = backupSchools.filter(s => s.campusSize === size && !existingNames.has(s.name));
        for (let i = 0; i < Math.min(needed, candidates.length); i++) {
          analysis.recommendedSchools.push(candidates[i]);
          existingNames.add(candidates[i].name);
        }
      }
    }
    console.log("After backup schools count:", analysis.recommendedSchools.length, "Micro:", analysis.recommendedSchools.filter((s: any) => s.campusSize === "Micro").length);

    for (const region of regions) {
      const countForRegion = analysis.recommendedSchools.filter(s => s.region === region).length;
      if (countForRegion < 3) {
        const needed = 3 - countForRegion;
        const candidates = backupSchools.filter(s => s.region === region && !existingNames.has(s.name));
        for (let i = 0; i < Math.min(needed, candidates.length); i++) {
          analysis.recommendedSchools.push(candidates[i]);
          existingNames.add(candidates[i].name);
        }
      }
    }

    return analysis;
  } catch {
    throw new Error("Failed to parse analysis response");
  }
}
