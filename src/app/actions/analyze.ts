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
import { isTestRequiredSchool, TEST_REQUIRED_SCHOOLS } from "@/lib/constants";

export async function getFilteredRecommendations(
  request: FilteredRecommendationsRequest
): Promise<RecommendedSchool[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const hasFilters =
    request.regions.length > 0 || request.sizes.length > 0 || request.policies.length > 0;

  // When filters are active, request 15 schools (overshoot) so the filter
  // gate has enough survivors to fill 3-3-3.  Without filters, 9 is fine.
  const schoolCount = hasFilters ? 15 : 9;

  const filterPrompt = buildFilterPrompt(request);
  const studentUserMsg = buildStudentMessage(request, schoolCount);

  const studentProfile = {
    testScores: request.testScores,
    gpa: request.recalculatedGPA,
    rigorScore: request.overallScore,
  };
  const studentDesc = buildStudentDesc(request);

  // ── Pass 1: initial GPT call ───────────────────────────────────
  let pool = await callGPTForSchools(openai, filterPrompt, studentUserMsg, schoolCount);

  let enriched = await enforce343Distribution(
    pool,
    studentProfile,
    openai,
    studentDesc,
    2,
    { sizes: request.sizes, policies: request.policies, regions: request.regions },
  );

  let passed = enforceFilterGate(enriched, request.regions, request.sizes, request.policies);

  // ── Progressive retry: widen GPA in steps until 3-3-3 fills ────────
  // Size/Region/Policy filters are MANDATORY and ABSOLUTE.
  // Academic criteria are FLEXIBLE and expand progressively.
  const GPA_STEPS = [0.5, 0.75, 1.0];
  const SAT_STEPS = [100, 200, 300];

  for (let step = 0; step < GPA_STEPS.length && passed.length < 9 && hasFilters; step++) {
    const gpaRange = GPA_STEPS[step];
    const satRange = SAT_STEPS[step];
    console.log(
      `[FilterRetry] Pass ${step + 2}: ${passed.length} schools — broadening GPA ±${gpaRange}, SAT ±${satRange}`
    );

    const excludeNames = passed.map((s) => s.name);
    const needed = 15 - passed.length;
    const broadenedMsg = buildBroadenedMessage(request, needed, excludeNames, gpaRange, satRange);

    const extraPool = await callGPTForSchools(openai, filterPrompt, broadenedMsg, needed);

    const extraEnriched = await enforce343Distribution(
      extraPool,
      studentProfile,
      openai,
      studentDesc,
      1,
      { sizes: request.sizes, policies: request.policies, regions: request.regions },
    );

    const extraPassed = enforceFilterGate(extraEnriched, request.regions, request.sizes, request.policies);

    // Merge, deduplicate
    const seenNames = new Set(passed.map((s) => s.name.toLowerCase()));
    for (const s of extraPassed) {
      if (!seenNames.has(s.name.toLowerCase())) {
        passed.push(s);
        seenNames.add(s.name.toLowerCase());
      }
    }
    console.log(`[FilterRetry] After pass ${step + 2}: ${passed.length} schools total`);
  }

  return passed;
}

// ── Helper: build the system prompt with filter constraints ──────────

const SIZE_DESCRIPTIONS: Record<CampusSizeType, string> = {
  Micro: "under 2,000",
  Small: "2,000-5,000",
  Medium: "5,000-15,000",
  Large: "15,000-30,000",
  Mega: "30,000+",
};

function buildFilterPrompt(request: FilteredRecommendationsRequest): string {
  const regionConstraint = request.regions.length > 0 && request.regions.length < 5
    ? `IMPORTANT: Only recommend schools from these regions: ${request.regions.join(" OR ")}. Do NOT include schools from other regions.`
    : "Include schools from multiple regions for geographic diversity.";

  const sizeConstraint = request.sizes.length > 0 && request.sizes.length < 5
    ? `IMPORTANT: Only recommend schools with these enrollment sizes: ${request.sizes.map(s => `${s} (${SIZE_DESCRIPTIONS[s]})`).join(" OR ")}. Do NOT include schools outside these size ranges.`
    : "Include a mix of Micro, Small, Medium, Large, and Mega schools.";

  let policyConstraint: string;
  if (request.policies.length > 0 && request.policies.length < 3) {
    policyConstraint = `STRICT REQUIREMENT: Only recommend schools with these testing policies: ${request.policies.join(" OR ")}. Do NOT include schools with other testing policies.`;
    if (!request.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 20);
      policyConstraint += `\nKNOWN TEST-REQUIRED SCHOOLS (DO NOT INCLUDE): ${shortNames.join(", ")}. These schools require test scores and do NOT match the selected policy filter.`;
    }
  } else {
    policyConstraint = "Include schools with various testing policies (Test Optional, Test Required, Test Blind).";
  }

  return `You are an expert college admissions counselor with knowledge of ALL accredited 4-year colleges and universities in the United States — not just top-50 or well-known schools. Search the FULL list of US institutions when applying filters.

Return ONLY a JSON object: { "schools": [{ "name", "url", "type", "region", "campusSize", "enrollment", "testPolicy", "acceptanceProbability", "matchReasoning" }] }

ACCEPTANCE PROBABILITY: integer 1-95. Reach < 40%, Match 40-70%, Safety > 70%.

REGION DEFINITIONS:
- Northeast: MA, NY, CT, RI, ME, VT, NH
- Mid-Atlantic: VA, DC, MD, PA, DE, NJ
- South: TX, GA, NC, FL, TN, SC, AL, LA, MS, AR, KY, WV
- Midwest: IL, MI, OH, WI, MN, IN, IA, MO, NE, KS, ND, SD
- West: CA, OR, WA, CO, AZ, UT, NV, NM, ID, MT, WY, HI, AK

SIZE DEFINITIONS:
- Micro: Under 2,000 undergrads | Small: 2,000-5,000 | Medium: 5,000-15,000 | Large: 15,000-30,000 | Mega: 30,000+

${regionConstraint}
${sizeConstraint}
${policyConstraint}

Distribution target: 3 Reach, 3 Match, 3 Safety.`;
}

// ── Helper: initial student message ──────────────────────────────────

function buildStudentMessage(request: FilteredRecommendationsRequest, count: number): string {
  return `Student Profile:
- Rigor Score: ${request.overallScore}/100
${request.recalculatedGPA ? `- Recalculated Core GPA: ${request.recalculatedGPA}/4.0 (weighted)` : ""}
- School Context: ${request.schoolProfileSummary}
- Academic Summary: ${request.transcriptSummary}
${request.testScores?.satReading && request.testScores?.satMath ? `- SAT Score: ${request.testScores.satReading + request.testScores.satMath} (${request.testScores.satReading} R/W + ${request.testScores.satMath} Math)` : ""}
${request.testScores?.actComposite ? `- ACT Composite: ${request.testScores.actComposite}` : ""}

Recommend EXACTLY ${count} colleges matching ALL specified Region, Size, and Policy filters. Include an exact acceptanceProbability (1-95%) for each.${request.testScores?.satReading || request.testScores?.satMath || request.testScores?.actComposite ? " Use test scores to refine categorization." : ""}`;
}

// ── Helper: broadened retry message (relaxed academic criteria) ───────

function buildBroadenedMessage(
  request: FilteredRecommendationsRequest,
  count: number,
  excludeNames: string[],
  gpaRange: number = 0.5,
  satRange: number = 100,
): string {
  const gpa = request.recalculatedGPA ?? 3.0;
  const satTotal =
    request.testScores?.satReading && request.testScores?.satMath
      ? request.testScores.satReading + request.testScores.satMath
      : null;

  // Build mandatory policy reminder for the broadened prompt
  let policyReminder = "";
  if (request.policies.length > 0 && request.policies.length < 3) {
    policyReminder = `\nMANDATORY TEST POLICY: Only include schools with these testing policies: ${request.policies.join(" OR ")}. Do NOT include schools with other testing policies.`;
    if (!request.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 20);
      policyReminder += `\nKNOWN TEST-REQUIRED SCHOOLS (DO NOT INCLUDE): ${shortNames.join(", ")}.`;
    }
  }

  return `I need ${count} MORE colleges that match the Region, Size, and Testing Policy filters above.
The Region, Size, and Testing Policy filters are MANDATORY — every school MUST match ALL of them.
The academic match is FLEXIBLE — broaden it as follows:
${policyReminder}
- Accept schools whose median freshman GPA is ${Math.max(1.0, gpa - gpaRange).toFixed(1)} to ${Math.min(5.0, gpa + gpaRange).toFixed(1)} (student GPA: ${gpa.toFixed(2)})
${satTotal ? `- Accept schools whose SAT middle-50% overlaps ${Math.max(400, satTotal - satRange)} to ${Math.min(1600, satTotal + satRange)} (student SAT: ${satTotal})` : ""}
- Include lesser-known but accredited 4-year colleges — not just nationally ranked schools
- Search the FULL list of US institutions in the specified Region and Size

Do NOT repeat any of these already-selected schools: ${excludeNames.join(", ")}

Return EXACTLY ${count} schools in the same JSON format. Include a mix of Reach, Match, and Safety.`;
}

// ── Helper: student description for Scorecard enrichment ─────────────

function buildStudentDesc(request: FilteredRecommendationsRequest): string {
  return [
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
}

// ── Helper: GPT call ─────────────────────────────────────────────────

async function callGPTForSchools(
  openai: OpenAI,
  systemPrompt: string,
  userMessage: string,
  _count: number,
): Promise<RecommendedSchool[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const result = JSON.parse(content) as { schools: RecommendedSchool[] };
    return result.schools ?? [];
  } catch (err) {
    console.error("[GPT-Filter] Call failed:", err);
    return [];
  }
}

/** Strict post-validation: every returned school must match ALL active filters.
 *  Also corrects testPolicy on school objects using the hard-coded override list. */
function enforceFilterGate(
  schools: RecommendedSchool[],
  regions: RegionType[],
  sizes: CampusSizeType[],
  policies: TestPolicyType[],
): RecommendedSchool[] {
  if (regions.length === 0 && sizes.length === 0 && policies.length === 0) {
    return schools;
  }

  // Correct testPolicy BEFORE filtering so the check uses ground truth
  const corrected = schools.map((s) => {
    if (isTestRequiredSchool(s.name) && s.testPolicy !== "Test Required") {
      return { ...s, testPolicy: "Test Required" as TestPolicyType };
    }
    return s;
  });

  const passed = corrected.filter((s) => {
    const regionOk = regions.length === 0 || regions.includes(s.region);
    const sizeOk = sizes.length === 0 || sizes.includes(getEnrollmentSize(s.enrollment));
    const policyOk = policies.length === 0 || policies.includes(s.testPolicy || "Test Optional");

    if (!regionOk || !sizeOk || !policyOk) {
      console.log(
        `[FilterGate] DISCARDED ${s.name}: region=${s.region} size=${getEnrollmentSize(s.enrollment)} policy=${s.testPolicy} — does not match filters`
      );
    }
    return regionOk && sizeOk && policyOk;
  });

  console.log(`[FilterGate] ${passed.length}/${schools.length} schools passed strict filter check`);
  return passed;
}
