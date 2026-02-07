"use server";

import OpenAI from "openai";
import type {
  CampusSizeType,
  RegionType,
  TestPolicyType,
  RecommendedSchool,
  FilteredRecommendationsRequest,
} from "@/lib/types";
import { enforce343Distribution, getEnrollmentSize, deduplicateByName } from "@/lib/scorecard";
import { isTestRequiredSchool, TEST_REQUIRED_SCHOOLS, getSchoolRegion } from "@/lib/constants";

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
  const filters = { sizes: request.sizes, policies: request.policies, regions: request.regions };

  // ── Pass 1: initial GPT call ───────────────────────────────────
  let pool = await callGPTForSchools(openai, filterPrompt, studentUserMsg, schoolCount);

  // FILTER BEFORE ENRICHMENT — discard mismatches immediately
  pool = preFilterPool(pool, request.regions, request.sizes, request.policies);
  console.log(`[Pass1] ${pool.length} schools survived pre-filter`);

  let enriched = await enforce343Distribution(
    pool, studentProfile, openai, studentDesc, 2, filters,
  );

  let passed = enforceFilterGate(enriched, request.regions, request.sizes, request.policies);

  // Re-correct Pass 1 results — ensure ground-truth metadata before progressive retry
  passed = correctSchoolMetadata(passed);
  console.log(`[Pass1] ${passed.length} schools passed filter gate`);

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

    let extraPool = await callGPTForSchools(openai, filterPrompt, broadenedMsg, needed);

    // FILTER BEFORE ENRICHMENT — discard mismatches immediately
    extraPool = preFilterPool(extraPool, request.regions, request.sizes, request.policies);

    const extraEnriched = await enforce343Distribution(
      extraPool, studentProfile, openai, studentDesc, 1, filters,
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
    // Re-correct merged pool — ensure progressive retry additions have ground-truth metadata
    passed = correctSchoolMetadata(passed);
    console.log(`[FilterRetry] After pass ${step + 2}: ${passed.length} schools total`);
  }

  // ── Force-fill: if still < 9, drop ALL academic criteria ────────
  // Size/Region/Policy are the ONLY requirements.  GPA/SAT ignored.
  if (passed.length < 9 && hasFilters) {
    console.log(`[ForceFill] Only ${passed.length} schools — dropping academic criteria entirely`);
    const excludeNames = passed.map((s) => s.name);
    const needed = 15 - passed.length;
    const forceMsg = buildForceSearchMessage(request, needed, excludeNames);

    let forcePool = await callGPTForSchools(openai, filterPrompt, forceMsg, needed);
    forcePool = preFilterPool(forcePool, request.regions, request.sizes, request.policies);

    const forceEnriched = await enforce343Distribution(
      forcePool, studentProfile, openai, studentDesc, 1, filters,
    );
    const forcePassed = enforceFilterGate(forceEnriched, request.regions, request.sizes, request.policies);

    const seenNames = new Set(passed.map((s) => s.name.toLowerCase()));
    for (const s of forcePassed) {
      if (!seenNames.has(s.name.toLowerCase())) {
        passed.push(s);
        seenNames.add(s.name.toLowerCase());
      }
    }
    // Re-correct merged pool — ensure force-fill additions have ground-truth metadata
    passed = correctSchoolMetadata(passed);
    console.log(`[ForceFill] After force-fill: ${passed.length} schools total`);
  }

  // ── Global database expansion: if still < 9, search the ENTIRE US ──
  // Physical filters (Size/Region/Policy) are 100% mandatory.
  // Academic match is 0% mandatory — completely ignored.
  if (passed.length < 9 && hasFilters) {
    console.log(`[GlobalSearch] Only ${passed.length} schools — launching global database expansion`);
    const excludeNames = passed.map((s) => s.name);
    const needed = 20; // Over-request to maximize filter survivors
    const globalMsg = buildGlobalSearchMessage(request, needed, excludeNames);

    let globalPool = await callGPTForSchools(openai, filterPrompt, globalMsg, needed);
    globalPool = preFilterPool(globalPool, request.regions, request.sizes, request.policies);

    const globalEnriched = await enforce343Distribution(
      globalPool, studentProfile, openai, studentDesc, 1, filters,
    );
    const globalPassed = enforceFilterGate(globalEnriched, request.regions, request.sizes, request.policies);

    const seenNames = new Set(passed.map((s) => s.name.toLowerCase()));
    for (const s of globalPassed) {
      if (!seenNames.has(s.name.toLowerCase())) {
        passed.push(s);
        seenNames.add(s.name.toLowerCase());
      }
    }
    // Re-correct merged pool — ensure global search additions have ground-truth metadata
    passed = correctSchoolMetadata(passed);
    console.log(`[GlobalSearch] After global expansion: ${passed.length} schools total`);
  }

  // ── FINAL VERIFICATION: zero-tolerance enrollment check ─────────
  passed = verifyFinalEnrollment(passed, request.sizes, request.regions, request.policies);

  // ── STRICT DEDUPLICATION: no school name may appear more than once ──
  passed = deduplicateByName(passed);

  // ── ABSOLUTE KILL-GATE: physically destroy any school outside size range ──
  // This is the last line of defense. If "Small" is selected, a school with
  // enrollment > 5,000 is physically impossible in the output.
  passed = absoluteEnrollmentKill(passed, request.sizes);

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

Distribution target: 3 Reach, 3 Match, 3 Safety.`;
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

Recommend EXACTLY ${count} colleges matching ALL specified Region, Size, and Policy filters. Include an exact acceptanceProbability (1-95%) for each.${request.testScores?.satReading || request.testScores?.satMath || request.testScores?.actComposite ? " Use test scores to refine categorization." : ""}
The "enrollment" field MUST be the REAL undergraduate enrollment number for each school.${constraintBlock}`;
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

  // Build ABSOLUTE REQUIREMENT filter reminders for the broadened prompt
  const filterReminders: string[] = [];

  if (request.sizes.length > 0 && request.sizes.length < 5) {
    const sizeDescs = request.sizes.map(s => `${s} (${SIZE_DESCRIPTIONS[s]} undergrads)`).join(" OR ");
    filterReminders.push(
      `ABSOLUTE REQUIREMENT — ENROLLMENT SIZE: Every school MUST have undergraduate enrollment within: ${sizeDescs}. A school with enrollment outside this range is WRONG and must not be included.`
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
    filterReminders.push(
      `ABSOLUTE REQUIREMENT — REGION: Every school MUST be in: ${regionDetails}. Verify each school's actual state.`
    );
  }

  if (request.policies.length > 0 && request.policies.length < 3) {
    let policyLine = `ABSOLUTE REQUIREMENT — TESTING POLICY: Every school MUST have policy: ${request.policies.join(" OR ")}. Do NOT include schools with other testing policies.`;
    if (!request.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 20);
      policyLine += `\nKNOWN TEST-REQUIRED SCHOOLS (DO NOT INCLUDE): ${shortNames.join(", ")}.`;
    }
    filterReminders.push(policyLine);
  }

  const constraintBlock = filterReminders.length > 0 ? filterReminders.join("\n\n") : "";

  return `I need ${count} MORE colleges that match the Region, Size, and Testing Policy filters above.
The Region, Size, and Testing Policy filters are ABSOLUTE — every school MUST match ALL of them.
The academic match is FLEXIBLE — broaden it as follows:

${constraintBlock}

- Accept schools whose median freshman GPA is ${Math.max(1.0, gpa - gpaRange).toFixed(1)} to ${Math.min(5.0, gpa + gpaRange).toFixed(1)} (student GPA: ${gpa.toFixed(2)})
${satTotal ? `- Accept schools whose SAT middle-50% overlaps ${Math.max(400, satTotal - satRange)} to ${Math.min(1600, satTotal + satRange)} (student SAT: ${satTotal})` : ""}
- Include lesser-known but accredited 4-year colleges — not just nationally ranked schools
- Search the FULL list of US institutions in the specified Region and Size
The "enrollment" field MUST be the REAL undergraduate enrollment number for each school.

Do NOT repeat any of these already-selected schools: ${excludeNames.join(", ")}

Return EXACTLY ${count} schools in the same JSON format. Include a mix of Reach, Match, and Safety.`;
}

// ── Helper: force-fill message (NO academic criteria) ─────────────────

function buildForceSearchMessage(
  request: FilteredRecommendationsRequest,
  count: number,
  excludeNames: string[],
): string {
  const sizeReq = request.sizes.length > 0
    ? `ABSOLUTE REQUIREMENT — ENROLLMENT SIZE: Every school MUST have enrollment matching: ${request.sizes.map(s => `${s} (${SIZE_DESCRIPTIONS[s]} students)`).join(" OR ")}. A school with enrollment outside this range is WRONG.`
    : "";
  let regionReq = "";
  if (request.regions.length > 0) {
    const regionStateMap: Record<string, string> = {
      "Northeast": "Massachusetts, Connecticut, Rhode Island, Maine, Vermont, New Hampshire, New York",
      "Mid-Atlantic": "Pennsylvania, New Jersey, Delaware, Maryland, Virginia, West Virginia, DC",
      "South": "North Carolina, South Carolina, Georgia, Florida, Alabama, Mississippi, Louisiana, Tennessee, Kentucky, Arkansas, Texas, Oklahoma",
      "Midwest": "Ohio, Michigan, Indiana, Illinois, Wisconsin, Minnesota, Iowa, Missouri, Kansas, Nebraska, South Dakota, North Dakota",
      "West": "California, Oregon, Washington, Colorado, Arizona, Nevada, Utah, New Mexico, Idaho, Montana, Wyoming, Hawaii, Alaska",
    };
    const regionDetails = request.regions.map((r) => `${r} (${regionStateMap[r] ?? ""})`).join(" OR ");
    regionReq = `ABSOLUTE REQUIREMENT — REGION: Every school MUST be in: ${regionDetails}. Verify each school's actual state.`;
  }

  let policyReq = "";
  if (request.policies.length > 0 && request.policies.length < 3) {
    policyReq = `ABSOLUTE REQUIREMENT — TESTING POLICY: Every school MUST have policy: ${request.policies.join(" OR ")}.`;
    if (!request.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 20);
      policyReq += ` DO NOT include: ${shortNames.join(", ")}.`;
    }
  }

  return `I need EXACTLY ${count} more accredited 4-year US colleges.

${sizeReq}
${regionReq}
${policyReq}

IGNORE GPA, SAT scores, and academic fit entirely. The ONLY requirements are the size, region, and testing policy filters above.
Include lesser-known but accredited schools — not just nationally ranked ones.
Search the FULL list of US institutions.
Include a mix of Reach, Match, and Safety.

Do NOT repeat any of these: ${excludeNames.join(", ")}

Return EXACTLY ${count} schools in the same JSON format.
The "enrollment" field MUST be the REAL undergraduate enrollment number.`;
}

// ── Helper: GLOBAL search message (entire US database, zero academic criteria) ──

function buildGlobalSearchMessage(
  request: FilteredRecommendationsRequest,
  count: number,
  excludeNames: string[],
): string {
  const sizeReq = request.sizes.length > 0
    ? `ABSOLUTE REQUIREMENT — ENROLLMENT SIZE: Every school MUST have enrollment matching: ${request.sizes.map(s => `${s} (${SIZE_DESCRIPTIONS[s]} students)`).join(" OR ")}. A school with enrollment outside this range is WRONG.`
    : "";
  let regionReq = "";
  if (request.regions.length > 0) {
    const regionStateMap: Record<string, string> = {
      "Northeast": "Massachusetts, Connecticut, Rhode Island, Maine, Vermont, New Hampshire, New York",
      "Mid-Atlantic": "Pennsylvania, New Jersey, Delaware, Maryland, Virginia, West Virginia, DC",
      "South": "North Carolina, South Carolina, Georgia, Florida, Alabama, Mississippi, Louisiana, Tennessee, Kentucky, Arkansas, Texas, Oklahoma",
      "Midwest": "Ohio, Michigan, Indiana, Illinois, Wisconsin, Minnesota, Iowa, Missouri, Kansas, Nebraska, South Dakota, North Dakota",
      "West": "California, Oregon, Washington, Colorado, Arizona, Nevada, Utah, New Mexico, Idaho, Montana, Wyoming, Hawaii, Alaska",
    };
    const regionDetails = request.regions.map((r) => `${r} (${regionStateMap[r] ?? ""})`).join(" OR ");
    regionReq = `ABSOLUTE REQUIREMENT — REGION: Every school MUST be in: ${regionDetails}. Verify each school's actual state.`;
  }

  let policyReq = "";
  if (request.policies.length > 0 && request.policies.length < 3) {
    policyReq = `ABSOLUTE REQUIREMENT — TESTING POLICY: Every school MUST have policy: ${request.policies.join(" OR ")}.`;
    if (!request.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 20);
      policyReq += ` DO NOT include: ${shortNames.join(", ")}.`;
    }
  }

  return `I need EXACTLY ${count} accredited 4-year US colleges from the ENTIRE national database.

${sizeReq}
${regionReq}
${policyReq}

IGNORE GPA, SAT scores, rigor, and ALL academic criteria. The ONLY requirements are size, region, and testing policy.
Search the COMPLETE database of ALL accredited US colleges and universities — not just well-known or nationally ranked schools.
Include regional universities, state colleges, liberal arts colleges, HBCUs, and any accredited 4-year institution that matches the physical filters.
Every school MUST be a DIFFERENT institution — no duplicates.
Include a mix of Reach (low acceptance rate), Match, and Safety (high acceptance rate).

Do NOT repeat any of these: ${excludeNames.join(", ")}

Return EXACTLY ${count} schools in the same JSON format.
The "enrollment" field MUST be the REAL undergraduate enrollment number.`;
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
