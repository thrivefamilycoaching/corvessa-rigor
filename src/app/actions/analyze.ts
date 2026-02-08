"use server";

import OpenAI from "openai";
import type {
  CampusSizeType,
  RegionType,
  TestPolicyType,
  RecommendedSchool,
  FilteredRecommendationsRequest,
} from "@/lib/types";
import { enforce343Distribution, enrichAndPick343, getEnrollmentSize, deduplicateByName, normalizeSchoolName } from "@/lib/scorecard";
import { isTestRequiredSchool, TEST_REQUIRED_SCHOOLS, getSchoolRegion } from "@/lib/constants";

export async function getFilteredRecommendations(
  request: FilteredRecommendationsRequest
): Promise<RecommendedSchool[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const hasFilters =
    request.regions.length > 0 || request.sizes.length > 0 || request.policies.length > 0;

  const filterPrompt = buildFilterPrompt(request);
  const studentProfile = {
    testScores: request.testScores,
    gpa: request.recalculatedGPA,
    rigorScore: request.overallScore,
  };
  const studentDesc = buildStudentDesc(request);
  const filters = { sizes: request.sizes, policies: request.policies, regions: request.regions };

  // ══════════════════════════════════════════════════════════════════
  // NO-FILTER PATH — academic-first, simplified
  // ══════════════════════════════════════════════════════════════════
  if (!hasFilters) {
    const studentUserMsg = buildStudentMessage(request, 9);
    let pool = await callGPTForSchools(openai, filterPrompt, studentUserMsg, 9);
    pool = await enforce343Distribution(pool, studentProfile, openai, studentDesc, 2, filters);
    console.log(`[NoFilter] Returning ${pool.length} academic-first schools`);
    return pool;
  }

  // ══════════════════════════════════════════════════════════════════
  // CHECKBOX-FIRST PIPELINE (hasFilters=true)
  // Stage 1: Broad checkbox pool (25 schools)
  // Stage 2: Expand if < 9 survivors (20 more schools)
  // ══════════════════════════════════════════════════════════════════

  // ── Stage 1: Checkbox Pool (25 schools) ─────────────────────────
  const stage1Msg = buildCheckboxPoolMessage(request, 25);
  let pool = await callGPTForSchools(openai, filterPrompt, stage1Msg, 25);
  pool = preFilterPool(pool, request.regions, request.sizes, request.policies);
  pool = deduplicateByName(pool);
  console.log(`[Stage1] ${pool.length} schools survived pre-filter`);

  // ── Stage 2: Expand immediately if pool < 12 ───────────────────
  // Don't wait until after pick343 — expand the raw pool BEFORE
  // distribution picking so pick343 has maximum material to work with.
  if (pool.length < 12) {
    console.log(`[Stage2] Only ${pool.length} in pool — expanding with 20 more`);
    const excludeNames = pool.map((s) => s.name);
    const stage2Msg = buildCheckboxExpandMessage(request, 20, excludeNames);

    let expandPool = await callGPTForSchools(openai, filterPrompt, stage2Msg, 20);
    expandPool = preFilterPool(expandPool, request.regions, request.sizes, request.policies);
    expandPool = deduplicateByName(expandPool);

    // Merge into pool (inline Set dedup with normalization)
    const seenNames = new Set(pool.map((s) => normalizeSchoolName(s.name)));
    for (const s of expandPool) {
      if (!seenNames.has(normalizeSchoolName(s.name))) {
        pool.push(s);
        seenNames.add(normalizeSchoolName(s.name));
      }
    }
    pool = deduplicateByName(pool);
    console.log(`[Stage2] Pool now ${pool.length} after expansion`);
  }

  // ── Save pre-enrichment pool for min-6 backfill ──
  const physicalPool = [...pool];

  // ── Enrich + Pick 3-3-3 (no internal GPT calls, no redundant filtering) ──
  let passed = await enrichAndPick343(pool, studentProfile);
  passed = correctSchoolMetadata(passed);
  passed = enforceFilterGate(passed, request.regions, request.sizes, request.policies);
  passed = deduplicateByName(passed);
  console.log(`[Pick343] ${passed.length} schools after enrich + pick + filter gate`);

  // ── FINAL GATES (unchanged) ─────────────────────────────────────
  passed = verifyFinalEnrollment(passed, request.sizes, request.regions, request.policies);
  passed = deduplicateByName(passed);
  passed = absoluteEnrollmentKill(passed, request.sizes);

  // ── MIN-6 BACKFILL: guarantee at least 6 schools when filters are active ──
  if (hasFilters && passed.length < 6) {
    console.log(`[Backfill] Only ${passed.length} schools — backfilling from physical pool (${physicalPool.length} candidates)`);
    const usedNames = new Set(passed.map(s => normalizeSchoolName(s.name)));
    const backfill = physicalPool
      .filter(s => !usedNames.has(normalizeSchoolName(s.name)))
      .map(s => ({ ...s, type: "match" as const }));
    for (const s of backfill) {
      if (passed.length >= 6) break;
      passed.push(s);
    }
    passed = deduplicateByName(passed);
    console.log(`[Backfill] After pool backfill: ${passed.length} schools`);
  }

  // ── STAGE 3 GPT FALLBACK: if still < 6 after pool backfill ──
  if (hasFilters && passed.length < 6) {
    console.log(`[Stage3] Still only ${passed.length} schools — firing physical-only GPT call`);
    const needed = 6 - passed.length + 3; // request extras to account for filter kills
    const excludeNames = passed.map(s => s.name);
    const stage3Msg = buildPhysicalOnlyMessage(request, needed, excludeNames);

    let stage3Pool = await callGPTForSchools(openai, filterPrompt, stage3Msg, needed);
    stage3Pool = preFilterPool(stage3Pool, request.regions, request.sizes, request.policies);
    stage3Pool = deduplicateByName(stage3Pool);

    // Merge with existing results (normalized dedup)
    const seenNames = new Set(passed.map(s => normalizeSchoolName(s.name)));
    for (const s of stage3Pool) {
      if (passed.length >= 6) break;
      if (!seenNames.has(normalizeSchoolName(s.name))) {
        passed.push({ ...s, type: "match" as const });
        seenNames.add(normalizeSchoolName(s.name));
      }
    }
    passed = deduplicateByName(passed);
    passed = absoluteEnrollmentKill(passed, request.sizes);
    console.log(`[Stage3] After GPT fallback: ${passed.length} schools`);
  }

  console.log(`[Final] Returning ${passed.length} unique, filter-verified schools`);
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
  // Build absolute constraints — SIZE is #1 priority
  const absoluteConstraints: string[] = [];

  if (request.sizes.length > 0 && request.sizes.length < 5) {
    const sizeDescs = request.sizes.map(s => `${s} (${SIZE_DESCRIPTIONS[s]} undergrads)`).join(" OR ");
    absoluteConstraints.push(
      `ABSOLUTE REQUIREMENT #1 — ENROLLMENT SIZE: Every school MUST have undergraduate enrollment within: ${sizeDescs}. A school with enrollment outside this range is WRONG and must not be included. Check the real enrollment number before including any school.`
    );
  }

  if (request.regions.length > 0 && request.regions.length < 5) {
    const regionStateMap: Record<string, string> = {
      "Northeast": "Massachusetts, Connecticut, Rhode Island, Maine, Vermont, New Hampshire, New York",
      "Mid-Atlantic": "Pennsylvania, New Jersey, Delaware, Maryland, Virginia, West Virginia, DC",
      "South": "North Carolina, South Carolina, Georgia, Florida, Alabama, Mississippi, Louisiana, Tennessee, Kentucky, Arkansas, Texas, Oklahoma",
      "Midwest": "Ohio, Michigan, Indiana, Illinois, Wisconsin, Minnesota, Iowa, Missouri, Kansas, Nebraska, South Dakota, North Dakota",
      "West": "California, Oregon, Washington, Colorado, Arizona, Nevada, Utah, New Mexico, Idaho, Montana, Wyoming, Hawaii, Alaska",
    };
    const regionDetails = request.regions.map((r) => `${r} (${regionStateMap[r] ?? ""})`).join(" OR ");
    absoluteConstraints.push(
      `ABSOLUTE REQUIREMENT #2 — REGION: Every school MUST be located in: ${regionDetails}. Look up each school's actual state and verify it belongs to the allowed region. Do NOT include schools from other regions.`
    );
  }

  if (request.policies.length > 0 && request.policies.length < 3) {
    let policyLine = `ABSOLUTE REQUIREMENT #3 — TESTING POLICY: Every school MUST have policy: ${request.policies.join(" OR ")}. Do NOT include schools with other testing policies.`;
    if (!request.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 20);
      policyLine += `\nKNOWN TEST-REQUIRED SCHOOLS (DO NOT INCLUDE): ${shortNames.join(", ")}. These schools require test scores and do NOT match the selected policy filter.`;
    }
    absoluteConstraints.push(policyLine);
  }

  const constraintBlock = absoluteConstraints.length > 0
    ? absoluteConstraints.join("\n\n") + "\n"
    : `Include schools from multiple regions for geographic diversity.
Include a mix of school sizes.
Include schools with various testing policies (Test Optional, Test Required, Test Blind).`;

  return `You are an expert college admissions counselor with knowledge of ALL accredited 4-year colleges and universities in the United States — not just top-50 or well-known schools. Search the FULL list of US institutions when applying filters.

${constraintBlock}

CRITICAL COUNT REQUIREMENT: You MUST return EXACTLY 9 schools — no more, no fewer. The response MUST contain exactly 3 Reach, 3 Match, and 3 Safety schools. A response with fewer than 9 schools is WRONG.

CRITICAL FILTER COMPLIANCE: Every single school MUST satisfy ALL active filter constraints (region, size, testing policy). Before including any school, verify:
1. Its real undergraduate enrollment falls within the allowed size range(s)
2. Its actual geographic location matches the allowed region(s)
3. Its testing policy matches the allowed policy filter(s)

Return ONLY a JSON object: { "schools": [{ "name", "url", "type", "region", "campusSize", "enrollment", "testPolicy", "acceptanceProbability", "matchReasoning" }] }

The "enrollment" field MUST be the REAL undergraduate enrollment number for each school. Double-check it.

ACCEPTANCE PROBABILITY: integer 1-95. Reach < 40%, Match 40-70%, Safety > 70%.

REGION DEFINITIONS:
- Northeast: MA, NY, CT, RI, ME, VT, NH
- Mid-Atlantic: VA, DC, MD, PA, DE, NJ
- South: TX, GA, NC, FL, TN, SC, AL, LA, MS, AR, KY, WV
- Midwest: IL, MI, OH, WI, MN, IN, IA, MO, NE, KS, ND, SD
- West: CA, OR, WA, CO, AZ, UT, NV, NM, ID, MT, WY, HI, AK

SIZE DEFINITIONS:
- Micro: Under 2,000 undergrads | Small: 2,000-5,000 | Medium: 5,000-15,000 | Large: 15,000-30,000 | Mega: 30,000+

BEFORE RESPONDING — VERIFICATION CHECKLIST:
- Count the schools array: is it exactly 9? If not, add or remove schools until it is.
- For each school, re-verify enrollment is within the allowed size range.
- For each school, re-verify the state/region matches the allowed region filter.
- Confirm distribution: exactly 3 Reach, 3 Match, 3 Safety.`;
}

// ── Helper: initial student message ──────────────────────────────────

function buildStudentMessage(request: FilteredRecommendationsRequest, count: number): string {
  // Build ABSOLUTE REQUIREMENT reminders for the user message (reinforces system prompt)
  const constraints: string[] = [];

  if (request.sizes.length > 0 && request.sizes.length < 5) {
    const sizeDescs = request.sizes.map(s => `${s} (${SIZE_DESCRIPTIONS[s]} undergrads)`).join(" OR ");
    constraints.push(
      `ABSOLUTE REQUIREMENT — ENROLLMENT SIZE: Every school MUST have undergraduate enrollment within: ${sizeDescs}. A school with enrollment outside this range is WRONG.`
    );
  }

  if (request.regions.length > 0 && request.regions.length < 5) {
    const regionStateMap: Record<string, string> = {
      "Northeast": "Massachusetts, Connecticut, Rhode Island, Maine, Vermont, New Hampshire, New York",
      "Mid-Atlantic": "Pennsylvania, New Jersey, Delaware, Maryland, Virginia, West Virginia, DC",
      "South": "North Carolina, South Carolina, Georgia, Florida, Alabama, Mississippi, Louisiana, Tennessee, Kentucky, Arkansas, Texas, Oklahoma",
      "Midwest": "Ohio, Michigan, Indiana, Illinois, Wisconsin, Minnesota, Iowa, Missouri, Kansas, Nebraska, South Dakota, North Dakota",
      "West": "California, Oregon, Washington, Colorado, Arizona, Nevada, Utah, New Mexico, Idaho, Montana, Wyoming, Hawaii, Alaska",
    };
    const regionDetails = request.regions.map((r) => `${r} (${regionStateMap[r] ?? ""})`).join(" OR ");
    constraints.push(
      `ABSOLUTE REQUIREMENT — REGION: Every school MUST be in: ${regionDetails}. Verify each school's actual state.`
    );
  }

  if (request.policies.length > 0 && request.policies.length < 3) {
    let policyLine = `ABSOLUTE REQUIREMENT — TESTING POLICY: Every school MUST have policy: ${request.policies.join(" OR ")}.`;
    if (!request.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 20);
      policyLine += ` DO NOT include: ${shortNames.join(", ")}.`;
    }
    constraints.push(policyLine);
  }

  const constraintBlock = constraints.length > 0 ? "\n\n" + constraints.join("\n\n") : "";

  return `Student Profile:
- Rigor Score: ${request.overallScore}/100
${request.recalculatedGPA ? `- Recalculated Core GPA: ${request.recalculatedGPA}/4.0 (weighted)` : ""}
- School Context: ${request.schoolProfileSummary}
- Academic Summary: ${request.transcriptSummary}
${request.testScores?.satReading && request.testScores?.satMath ? `- SAT Score: ${request.testScores.satReading + request.testScores.satMath} (${request.testScores.satReading} R/W + ${request.testScores.satMath} Math)` : ""}
${request.testScores?.actComposite ? `- ACT Composite: ${request.testScores.actComposite}` : ""}

You MUST return EXACTLY ${count} colleges — no more, no fewer. Every single school MUST match ALL specified Region, Size, and Policy filters. Include an exact acceptanceProbability (1-95%) for each. Distribution: exactly 3 Reach, 3 Match, 3 Safety.${request.testScores?.satReading || request.testScores?.satMath || request.testScores?.actComposite ? " Use test scores to refine categorization." : ""}
The "enrollment" field MUST be the REAL undergraduate enrollment number for each school.
BEFORE RESPONDING: Count your schools array — if it is not exactly ${count}, fix it.${constraintBlock}`;
}

// ── Helper: checkbox pool message (Stage 1 — checkboxes are PRIMARY) ──

function buildCheckboxPoolMessage(
  request: FilteredRecommendationsRequest,
  count: number,
): string {
  const regionStateMap: Record<string, string> = {
    "Northeast": "Massachusetts, Connecticut, Rhode Island, Maine, Vermont, New Hampshire, New York",
    "Mid-Atlantic": "Pennsylvania, New Jersey, Delaware, Maryland, Virginia, West Virginia, DC",
    "South": "North Carolina, South Carolina, Georgia, Florida, Alabama, Mississippi, Louisiana, Tennessee, Kentucky, Arkansas, Texas, Oklahoma",
    "Midwest": "Ohio, Michigan, Indiana, Illinois, Wisconsin, Minnesota, Iowa, Missouri, Kansas, Nebraska, South Dakota, North Dakota",
    "West": "California, Oregon, Washington, Colorado, Arizona, Nevada, Utah, New Mexico, Idaho, Montana, Wyoming, Hawaii, Alaska",
  };

  // PRIMARY: Physical filter constraints — the ONLY selection criteria
  const primary: string[] = [];

  if (request.sizes.length > 0 && request.sizes.length < 5) {
    const sizeDescs = request.sizes.map(s => `${s} (${SIZE_DESCRIPTIONS[s]} undergrads)`).join(" OR ");
    primary.push(
      `ABSOLUTE REQUIREMENT #1 — ENROLLMENT SIZE: Every school MUST have undergraduate enrollment within: ${sizeDescs}. A school with enrollment outside this range is WRONG and must not be included. Check the real enrollment number before including any school.`
    );
  }

  if (request.regions.length > 0 && request.regions.length < 5) {
    const regionDetails = request.regions.map((r) => `${r} (${regionStateMap[r] ?? ""})`).join(" OR ");
    primary.push(
      `ABSOLUTE REQUIREMENT #2 — REGION: Every school MUST be located in: ${regionDetails}. Look up each school's actual state and verify it belongs to the allowed region. Do NOT include schools from other regions.`
    );
  }

  if (request.policies.length > 0 && request.policies.length < 3) {
    let policyLine = `ABSOLUTE REQUIREMENT #3 — TESTING POLICY: Every school MUST have policy: ${request.policies.join(" OR ")}. Do NOT include schools with other testing policies.`;
    if (!request.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 20);
      policyLine += `\nKNOWN TEST-REQUIRED SCHOOLS (DO NOT INCLUDE): ${shortNames.join(", ")}.`;
    }
    primary.push(policyLine);
  }

  const primaryBlock = primary.length > 0 ? primary.join("\n\n") : "";

  // SECONDARY: Student profile for probability estimation ONLY
  const secondaryParts: string[] = [];
  if (request.recalculatedGPA) secondaryParts.push(`GPA: ${request.recalculatedGPA}/4.0 (weighted)`);
  secondaryParts.push(`Rigor Score: ${request.overallScore}/100`);
  if (request.testScores?.satReading && request.testScores?.satMath) {
    secondaryParts.push(`SAT: ${request.testScores.satReading + request.testScores.satMath}`);
  }
  if (request.testScores?.actComposite) {
    secondaryParts.push(`ACT: ${request.testScores.actComposite}`);
  }

  return `CRITICAL FILTER REQUIREMENTS (use ONLY these to choose which schools to include):
${primaryBlock}

You MUST return EXACTLY ${count} accredited 4-year US colleges. Every single school MUST match ALL of the above physical filters — no exceptions.
Search the COMPLETE national database — include lesser-known regional universities, state colleges, liberal arts colleges, HBCUs, and small private institutions, not just nationally ranked schools.
Include a BROAD range of selectivity levels: highly selective, moderately selective, and open/easy admission.

SECONDARY — STUDENT PROFILE (use ONLY to estimate acceptanceProbability, do NOT use to narrow school selection):
${secondaryParts.join(" | ")}
School Context: ${request.schoolProfileSummary}
Academic Summary: ${request.transcriptSummary}

The "enrollment" field MUST be the REAL undergraduate enrollment number for each school.
Return a mix of Reach (< 40%), Match (40-70%), and Safety (> 70%).
BEFORE RESPONDING: Count your schools array — if it is not exactly ${count}, fix it. Verify every school's enrollment and region against the filters.`;
}

// ── Helper: checkbox expand message (Stage 2 — additional schools) ─────

function buildCheckboxExpandMessage(
  request: FilteredRecommendationsRequest,
  count: number,
  excludeNames: string[],
): string {
  const regionStateMap: Record<string, string> = {
    "Northeast": "Massachusetts, Connecticut, Rhode Island, Maine, Vermont, New Hampshire, New York",
    "Mid-Atlantic": "Pennsylvania, New Jersey, Delaware, Maryland, Virginia, West Virginia, DC",
    "South": "North Carolina, South Carolina, Georgia, Florida, Alabama, Mississippi, Louisiana, Tennessee, Kentucky, Arkansas, Texas, Oklahoma",
    "Midwest": "Ohio, Michigan, Indiana, Illinois, Wisconsin, Minnesota, Iowa, Missouri, Kansas, Nebraska, South Dakota, North Dakota",
    "West": "California, Oregon, Washington, Colorado, Arizona, Nevada, Utah, New Mexico, Idaho, Montana, Wyoming, Hawaii, Alaska",
  };

  const primary: string[] = [];

  if (request.sizes.length > 0 && request.sizes.length < 5) {
    const sizeDescs = request.sizes.map(s => `${s} (${SIZE_DESCRIPTIONS[s]} undergrads)`).join(" OR ");
    primary.push(
      `ABSOLUTE REQUIREMENT #1 — ENROLLMENT SIZE: Every school MUST have undergraduate enrollment within: ${sizeDescs}. A school with enrollment outside this range is WRONG and must not be included.`
    );
  }

  if (request.regions.length > 0 && request.regions.length < 5) {
    const regionDetails = request.regions.map((r) => `${r} (${regionStateMap[r] ?? ""})`).join(" OR ");
    primary.push(
      `ABSOLUTE REQUIREMENT #2 — REGION: Every school MUST be located in: ${regionDetails}. Verify each school's actual state.`
    );
  }

  if (request.policies.length > 0 && request.policies.length < 3) {
    let policyLine = `ABSOLUTE REQUIREMENT #3 — TESTING POLICY: Every school MUST have policy: ${request.policies.join(" OR ")}.`;
    if (!request.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 20);
      policyLine += ` DO NOT include: ${shortNames.join(", ")}.`;
    }
    primary.push(policyLine);
  }

  const primaryBlock = primary.length > 0 ? primary.join("\n\n") : "";

  const secondaryParts: string[] = [];
  if (request.recalculatedGPA) secondaryParts.push(`GPA: ${request.recalculatedGPA}/4.0 (weighted)`);
  secondaryParts.push(`Rigor Score: ${request.overallScore}/100`);
  if (request.testScores?.satReading && request.testScores?.satMath) {
    secondaryParts.push(`SAT: ${request.testScores.satReading + request.testScores.satMath}`);
  }
  if (request.testScores?.actComposite) {
    secondaryParts.push(`ACT: ${request.testScores.actComposite}`);
  }

  return `I need ${count} ADDITIONAL accredited 4-year US colleges from the COMPLETE national database.

PRIMARY SELECTION CRITERIA (use ONLY these to choose which schools to include):
${primaryBlock}

Search the COMPLETE national database of ALL accredited US colleges and universities.
Include regional universities, state colleges, liberal arts colleges, HBCUs, and any accredited 4-year institution that matches the physical filters.
Include a BROAD range of selectivity levels.

SECONDARY — STUDENT PROFILE (use ONLY to estimate acceptanceProbability, do NOT use to narrow school selection):
${secondaryParts.join(" | ")}

Do NOT repeat any of these already-selected schools: ${excludeNames.join(", ")}

Return EXACTLY ${count} schools in the same JSON format.
The "enrollment" field MUST be the REAL undergraduate enrollment number.
Include a mix of Reach (< 40%), Match (40-70%), and Safety (> 70%).`;
}

// ── Helper: physical-only message (Stage 3 — min-6 fallback, no academic criteria) ──

function buildPhysicalOnlyMessage(
  request: FilteredRecommendationsRequest,
  count: number,
  excludeNames: string[],
): string {
  const regionStateMap: Record<string, string> = {
    "Northeast": "Massachusetts, Connecticut, Rhode Island, Maine, Vermont, New Hampshire, New York",
    "Mid-Atlantic": "Pennsylvania, New Jersey, Delaware, Maryland, Virginia, West Virginia, DC",
    "South": "North Carolina, South Carolina, Georgia, Florida, Alabama, Mississippi, Louisiana, Tennessee, Kentucky, Arkansas, Texas, Oklahoma",
    "Midwest": "Ohio, Michigan, Indiana, Illinois, Wisconsin, Minnesota, Iowa, Missouri, Kansas, Nebraska, South Dakota, North Dakota",
    "West": "California, Oregon, Washington, Colorado, Arizona, Nevada, Utah, New Mexico, Idaho, Montana, Wyoming, Hawaii, Alaska",
  };

  const constraints: string[] = [];

  if (request.sizes.length > 0 && request.sizes.length < 5) {
    const sizeDescs = request.sizes.map(s => `${s} (${SIZE_DESCRIPTIONS[s]} undergrads)`).join(" OR ");
    constraints.push(
      `ABSOLUTE REQUIREMENT — ENROLLMENT SIZE: Every school MUST have undergraduate enrollment within: ${sizeDescs}. A school with enrollment outside this range is WRONG.`
    );
  }

  if (request.regions.length > 0 && request.regions.length < 5) {
    const regionDetails = request.regions.map((r) => `${r} (${regionStateMap[r] ?? ""})`).join(" OR ");
    constraints.push(
      `ABSOLUTE REQUIREMENT — REGION: Every school MUST be in: ${regionDetails}. Verify each school's actual state.`
    );
  }

  if (request.policies.length > 0 && request.policies.length < 3) {
    let policyLine = `ABSOLUTE REQUIREMENT — TESTING POLICY: Every school MUST have policy: ${request.policies.join(" OR ")}.`;
    if (!request.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 20);
      policyLine += ` DO NOT include: ${shortNames.join(", ")}.`;
    }
    constraints.push(policyLine);
  }

  const constraintBlock = constraints.length > 0 ? constraints.join("\n\n") : "";

  return `PHYSICAL FILTERS ONLY — ignore GPA, SAT, ACT, and academic matching entirely.
Select schools based ONLY on the physical constraints below.

${constraintBlock}

List EXACTLY ${count} accredited 4-year US colleges that match ALL of the above physical filters.
Search the COMPLETE national database — include lesser-known regional universities, state colleges, liberal arts colleges, HBCUs, and small private institutions.
Include a BROAD range of selectivity levels.

Do NOT repeat any of these already-selected schools: ${excludeNames.join(", ")}

The "enrollment" field MUST be the REAL undergraduate enrollment number.
Set acceptanceProbability to 50 for all schools (academic matching is not relevant here).`;
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
      model: "gpt-4o-mini",
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
    const raw = result.schools ?? [];

    // CORRECT metadata at source — fix campusSize/region/testPolicy IMMEDIATELY
    const corrected = correctSchoolMetadata(raw);
    // DEDUPLICATE at source — GPT can return the same school twice
    return deduplicateByName(corrected);
  } catch (err) {
    console.error("[GPT-Filter] Call failed:", err);
    return [];
  }
}

// ── Helper: enrollment-based size check (numeric, not label) ──────────

function enrollmentMatchesSize(enrollment: number, size: CampusSizeType): boolean {
  switch (size) {
    case "Micro": return enrollment > 0 && enrollment < 2000;
    case "Small": return enrollment >= 2000 && enrollment <= 5000;
    case "Medium": return enrollment > 5000 && enrollment <= 15000;
    case "Large": return enrollment > 15000 && enrollment <= 30000;
    case "Mega": return enrollment > 30000;
    default: return false;
  }
}

/** HARD ENROLLMENT KILL-GATE: physically removes any school whose enrollment
 *  falls outside the allowed size ranges.  This is the absolute last line of
 *  defense — if a school is > 5,000 students, it CANNOT appear when "Small"
 *  is selected. Period. */
function absoluteEnrollmentKill(
  schools: RecommendedSchool[],
  sizes: CampusSizeType[],
): RecommendedSchool[] {
  if (sizes.length === 0) return schools;
  return schools.filter((s) => {
    const enrollment = s.enrollment ?? 0;
    const ok = sizes.some((sz) => enrollmentMatchesSize(enrollment, sz));
    if (!ok) {
      console.log(`[KILL-GATE] DESTROYED ${s.name}: enrollment=${enrollment} not in ${sizes.join("/")}`);
    }
    return ok;
  });
}

/** Correct campusSize, region, and testPolicy on all schools using hard-coded
 *  authoritative data BEFORE any filter check runs. */
function correctSchoolMetadata(schools: RecommendedSchool[]): RecommendedSchool[] {
  return schools.map((s) => {
    let corrected = s;
    // Correct campusSize from enrollment
    if (corrected.enrollment > 0) {
      const correctSize = getEnrollmentSize(corrected.enrollment);
      if (correctSize !== corrected.campusSize) {
        console.log(`[MetaCorrect] ${corrected.name}: campusSize "${corrected.campusSize}" → "${correctSize}" (enrollment=${corrected.enrollment})`);
        corrected = { ...corrected, campusSize: correctSize };
      }
    }
    // Correct region from state mapping
    const correctRegion = getSchoolRegion(corrected.name);
    if (correctRegion && correctRegion !== corrected.region) {
      console.log(`[MetaCorrect] ${corrected.name}: region "${corrected.region}" → "${correctRegion}"`);
      corrected = { ...corrected, region: correctRegion };
    }
    // Correct test policy from override list
    if (isTestRequiredSchool(corrected.name) && corrected.testPolicy !== "Test Required") {
      console.log(`[MetaCorrect] ${corrected.name}: testPolicy "${corrected.testPolicy}" → "Test Required"`);
      corrected = { ...corrected, testPolicy: "Test Required" as TestPolicyType };
    }
    return corrected;
  });
}

/** FILTER BEFORE ENRICHMENT: discard schools that violate hard constraints
 *  using raw enrollment numbers. Runs BEFORE Scorecard enrichment. */
function preFilterPool(
  schools: RecommendedSchool[],
  regions: RegionType[],
  sizes: CampusSizeType[],
  policies: TestPolicyType[],
): RecommendedSchool[] {
  if (regions.length === 0 && sizes.length === 0 && policies.length === 0) return schools;

  // Correct metadata BEFORE filtering so checks use ground truth
  const corrected = correctSchoolMetadata(schools);
  const before = corrected.length;
  const filtered = corrected.filter((s) => {
    const regionOk = regions.length === 0 || regions.includes(s.region);
    const sizeOk = sizes.length === 0 || sizes.some((sz) => enrollmentMatchesSize(s.enrollment ?? 0, sz));
    const effectivePolicy: TestPolicyType = isTestRequiredSchool(s.name)
      ? "Test Required"
      : (s.testPolicy || "Test Optional");
    const policyOk = policies.length === 0 || policies.includes(effectivePolicy);

    if (!regionOk || !sizeOk || !policyOk) {
      console.log(
        `[PreFilter] KILLED ${s.name}: enrollment=${s.enrollment} region=${s.region} policy=${effectivePolicy}`
      );
    }
    return regionOk && sizeOk && policyOk;
  });

  console.log(`[PreFilter] ${filtered.length}/${before} survived hard constraints`);
  return filtered;
}

/** FINAL VERIFICATION: check every school's enrollment against filters.
 *  Any mismatch is discarded — zero tolerance. */
function verifyFinalEnrollment(
  schools: RecommendedSchool[],
  sizes: CampusSizeType[],
  regions: RegionType[],
  policies: TestPolicyType[],
): RecommendedSchool[] {
  if (sizes.length === 0 && regions.length === 0 && policies.length === 0) return schools;

  // Correct metadata one final time before the zero-tolerance check
  const correctedSchools = correctSchoolMetadata(schools);
  const verified = correctedSchools.filter((s) => {
    const sizeOk = sizes.length === 0 || sizes.some((sz) => enrollmentMatchesSize(s.enrollment ?? 0, sz));
    const regionOk = regions.length === 0 || regions.includes(s.region);
    const effectivePolicy: TestPolicyType = isTestRequiredSchool(s.name)
      ? "Test Required"
      : (s.testPolicy || "Test Optional");
    const policyOk = policies.length === 0 || policies.includes(effectivePolicy);

    if (!sizeOk || !regionOk || !policyOk) {
      console.log(
        `[FinalVerify] REJECTED ${s.name}: enrollment=${s.enrollment} region=${s.region} policy=${effectivePolicy}`
      );
    }
    return sizeOk && regionOk && policyOk;
  });

  console.log(`[FinalVerify] ${verified.length}/${schools.length} passed final enrollment check`);
  return verified;
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

  // Correct campusSize, region, and testPolicy BEFORE filtering so checks use ground truth
  const corrected = correctSchoolMetadata(schools);

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
