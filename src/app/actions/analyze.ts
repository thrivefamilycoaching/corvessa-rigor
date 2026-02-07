"use server";

import OpenAI from "openai";
import type {
  CampusSizeType,
  RegionType,
  TestPolicyType,
  RecommendedSchool,
  FilteredRecommendationsRequest,
} from "@/lib/types";
import { enforce343Distribution, getEnrollmentSize } from "@/lib/scorecard";
import { isTestRequiredSchool } from "@/lib/constants";

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
        content: `You are an expert college admissions counselor. Based on a student's profile, recommend EXACTLY 9 colleges.

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
- CATEGORY THRESHOLDS (use acceptanceProbability to assign type):
  * Reach: acceptanceProbability < 40%
  * Match: acceptanceProbability 40%-70%
  * Safety: acceptanceProbability > 70%

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

You MUST return EXACTLY 9 schools. No more, no fewer.
Categorize by acceptanceProbability: Safety (>70%), Match (40-70%), Reach (<40%). Distribution: 3 Safety, 3 Match, 3 Reach. No exceptions.
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

    // Enforce 3-3-3 distribution with Scorecard API enrichment + targeted fill
    const studentProfile = {
      testScores: request.testScores,
      gpa: request.recalculatedGPA,
      rigorScore: request.overallScore,
    };
    const studentDesc = [
      `Student Profile:`,
      request.recalculatedGPA
        ? `- GPA: ${request.recalculatedGPA} (weighted)`
        : "",
      `- Rigor Score: ${request.overallScore}/100`,
      request.testScores?.satReading && request.testScores?.satMath
        ? `- SAT: ${request.testScores.satReading + request.testScores.satMath}`
        : "",
      request.testScores?.actComposite
        ? `- ACT: ${request.testScores.actComposite}`
        : "",
      `- School Context: ${request.schoolProfileSummary}`,
      `- Academic Summary: ${request.transcriptSummary}`,
    ]
      .filter(Boolean)
      .join("\n");

    const enriched = await enforce343Distribution(
      result.schools,
      studentProfile,
      openai,
      studentDesc,
      2,
      { sizes: request.sizes, policies: request.policies },
    );

    // ── CROSS-CHECK VERIFICATION ──────────────────────────────────
    // Hard gate: discard any school that does not match the selected
    // Region AND Size AND Policy filters.  GPT and Scorecard both
    // try to comply, but neither is guaranteed — this catches leaks.
    return enforceFilterGate(enriched, request.regions, request.sizes, request.policies);
  } catch {
    throw new Error("Failed to parse recommendations");
  }
}

/** Strict post-validation: every returned school must match ALL active filters. */
function enforceFilterGate(
  schools: RecommendedSchool[],
  regions: RegionType[],
  sizes: CampusSizeType[],
  policies: TestPolicyType[],
): RecommendedSchool[] {
  if (regions.length === 0 && sizes.length === 0 && policies.length === 0) {
    return schools;
  }

  const passed = schools.filter((s) => {
    const regionOk = regions.length === 0 || regions.includes(s.region);
    const sizeOk = sizes.length === 0 || sizes.includes(getEnrollmentSize(s.enrollment));
    const effectivePolicy: TestPolicyType = isTestRequiredSchool(s.name)
      ? "Test Required"
      : (s.testPolicy || "Test Optional");
    const policyOk = policies.length === 0 || policies.includes(effectivePolicy);

    if (!regionOk || !sizeOk || !policyOk) {
      console.log(
        `[FilterGate] DISCARDED ${s.name}: region=${s.region} size=${getEnrollmentSize(s.enrollment)} policy=${effectivePolicy} — does not match filters`
      );
    }
    return regionOk && sizeOk && policyOk;
  });

  console.log(`[FilterGate] ${passed.length}/${schools.length} schools passed strict filter check`);
  return passed;
}
