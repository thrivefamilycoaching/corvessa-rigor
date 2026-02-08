import { NextRequest, NextResponse } from "next/server";
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

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const request = (await req.json()) as FilteredRecommendationsRequest;
    const schools = await getFilteredRecommendations(request);
    return NextResponse.json({ schools });
  } catch (err) {
    console.error("[filtered-recommendations] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch filtered recommendations" },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Core logic (moved from src/app/actions/analyze.ts)
// ══════════════════════════════════════════════════════════════════════════════

async function getFilteredRecommendations(
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

  // ── Save pre-enrichment pool for min-9 backfill ──
  const physicalPool = [...pool];

  // ── Enrich + Pick 3-3-3 (no internal GPT calls, no redundant filtering) ──
  let passed = await enrichAndPick343(pool, studentProfile);
  passed = correctSchoolMetadata(passed);
  passed = enforceFilterGate(passed, request.regions, request.sizes, request.policies);
  passed = deduplicateByName(passed);
  console.log(`[Pick343] ${passed.length} schools after enrich + pick + filter gate`);

  // ── FINAL GATES ─────────────────────────────────────────────────
  passed = verifyFinalEnrollment(passed, request.sizes, request.regions, request.policies);
  passed = deduplicateByName(passed);
  passed = absoluteEnrollmentKill(passed, request.sizes);

  // ── MIN-9 BACKFILL: guarantee at least 9 schools when filters are active ──
  if (hasFilters && passed.length < 9) {
    console.log(`[Backfill] Only ${passed.length} schools — backfilling from physical pool (${physicalPool.length} candidates)`);
    const usedNames = new Set(passed.map(s => normalizeSchoolName(s.name)));
    const backfill = physicalPool
      .filter(s => !usedNames.has(normalizeSchoolName(s.name)))
      .map(s => ({ ...s, type: "match" as const }));
    for (const s of backfill) {
      if (passed.length >= 9) break;
      passed.push(s);
    }
    passed = deduplicateByName(passed);
    console.log(`[Backfill] After pool backfill: ${passed.length} schools`);
  }

  // ── STAGE 3 GPT FALLBACK: if still < 9 after pool backfill ──
  if (hasFilters && passed.length < 9) {
    console.log(`[Stage3] Still only ${passed.length} schools — firing physical-only GPT call`);
    const needed = 9 - passed.length + 3;
    const excludeNames = passed.map(s => s.name);
    const stage3Msg = buildPhysicalOnlyMessage(request, needed, excludeNames);

    let stage3Pool = await callGPTForSchools(openai, filterPrompt, stage3Msg, needed);
    stage3Pool = preFilterPool(stage3Pool, request.regions, request.sizes, request.policies);
    stage3Pool = deduplicateByName(stage3Pool);

    const seenNames = new Set(passed.map(s => normalizeSchoolName(s.name)));
    for (const s of stage3Pool) {
      if (passed.length >= 9) break;
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

// ── Prompt builders ───────────────────────────────────────────────────────────

const SIZE_DESCRIPTIONS: Record<CampusSizeType, string> = {
  Micro: "under 2,000",
  Small: "2,000-5,000",
  Medium: "5,000-15,000",
  Large: "15,000-30,000",
  Mega: "30,000+",
};

function buildFilterPrompt(request: FilteredRecommendationsRequest): string {
  const constraints: string[] = [];

  if (request.sizes.length > 0 && request.sizes.length < 5) {
    const sizeDescs = request.sizes.map(s => `${s} (${SIZE_DESCRIPTIONS[s]})`).join(" or ");
    constraints.push(`SIZE: enrollment must be ${sizeDescs}.`);
  }

  if (request.regions.length > 0 && request.regions.length < 5) {
    constraints.push(`REGION: must be in ${request.regions.join(" or ")}.`);
  }

  if (request.policies.length > 0 && request.policies.length < 3) {
    constraints.push(`TESTING: must be ${request.policies.join(" or ")}.`);
  }

  const filterBlock = constraints.length > 0
    ? `FILTER CONSTRAINTS: ${constraints.join(" ")}`
    : "Include geographic and size diversity.";

  return `You are a college admissions expert. Return a JSON object with a "schools" array containing EXACTLY 9 colleges: 3 reach, 3 match, 3 safety.

Each school object: { "name", "url", "type" (reach/match/safety), "region" (Northeast/Mid-Atlantic/South/Midwest/West), "campusSize" (Micro/Small/Medium/Large/Mega), "enrollment" (real number), "testPolicy" (Test Optional/Test Required/Test Blind), "acceptanceProbability" (1-95), "matchReasoning" (1-2 sentences) }

${filterBlock}

If exact filter matches are insufficient for 9 schools, expand to adjacent sizes to reach 9. Always report actual enrollment and campusSize accurately. Never return fewer than 9.

Sizes: Micro <2K | Small 2-5K | Medium 5-15K | Large 15-30K | Mega 30K+
Regions: Northeast (MA,NY,CT,RI,ME,VT,NH) | Mid-Atlantic (PA,NJ,DE,MD,VA,WV,DC) | South (NC,SC,GA,FL,AL,MS,LA,TN,KY,AR,TX,OK) | Midwest (OH,MI,IN,IL,WI,MN,IA,MO,KS,NE,ND,SD) | West (CA,OR,WA,CO,AZ,NV,UT,NM,ID,MT,WY,HI,AK)
Probability: Reach <40%, Match 40-70%, Safety >70%.`;
}

function buildStudentMessage(request: FilteredRecommendationsRequest, count: number): string {
  const parts: string[] = [`Rigor: ${request.overallScore}/100`];
  if (request.recalculatedGPA) parts.push(`GPA: ${request.recalculatedGPA}`);
  if (request.testScores?.satReading && request.testScores?.satMath) {
    parts.push(`SAT: ${request.testScores.satReading + request.testScores.satMath}`);
  }
  if (request.testScores?.actComposite) parts.push(`ACT: ${request.testScores.actComposite}`);

  return `Student: ${parts.join(" | ")}
Context: ${request.schoolProfileSummary}
Academic: ${request.transcriptSummary}

Return EXACTLY ${count} schools (3 reach, 3 match, 3 safety). Use real enrollment numbers.`;
}

function buildCheckboxPoolMessage(
  request: FilteredRecommendationsRequest,
  count: number,
): string {
  const constraints = buildConstraintLines(request);
  const student = buildStudentOneLiner(request);

  return `Return EXACTLY ${count} accredited 4-year US colleges matching ALL filters below.
${constraints}
Student (for probability only): ${student}
Context: ${request.schoolProfileSummary}
Academic: ${request.transcriptSummary}
Include diverse selectivity (reach/match/safety mix) and lesser-known schools, not just top-ranked.
Use real enrollment numbers. If exact filter matches are insufficient, prioritize region and relax size slightly.`;
}

function buildCheckboxExpandMessage(
  request: FilteredRecommendationsRequest,
  count: number,
  excludeNames: string[],
): string {
  const constraints = buildConstraintLines(request);

  return `Return ${count} ADDITIONAL colleges matching ALL filters. Same JSON format.
${constraints}
EXCLUDE these already-selected schools: ${excludeNames.join(", ")}
Include lesser-known regional/state/HBCU schools. Use real enrollment numbers. Mix of selectivity levels.`;
}

function buildPhysicalOnlyMessage(
  request: FilteredRecommendationsRequest,
  count: number,
  excludeNames: string[],
): string {
  const constraints = buildConstraintLines(request);

  return `Ignore academics. Return ${count} colleges matching ONLY physical filters.
${constraints}
EXCLUDE: ${excludeNames.join(", ")}
Set acceptanceProbability to 50 for all. Use real enrollment numbers.
If insufficient exact matches, prioritize region and relax size slightly.`;
}

function buildConstraintLines(request: FilteredRecommendationsRequest): string {
  const lines: string[] = [];
  if (request.sizes.length > 0 && request.sizes.length < 5) {
    const sizeDescs = request.sizes.map(s => `${s} (${SIZE_DESCRIPTIONS[s]})`).join(" or ");
    lines.push(`SIZE: ${sizeDescs}`);
  }
  if (request.regions.length > 0 && request.regions.length < 5) {
    lines.push(`REGION: ${request.regions.join(" or ")}`);
  }
  if (request.policies.length > 0 && request.policies.length < 3) {
    let line = `TESTING: ${request.policies.join(" or ")}`;
    if (!request.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 10);
      line += ` (exclude: ${shortNames.join(", ")})`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function buildStudentOneLiner(request: FilteredRecommendationsRequest): string {
  const parts: string[] = [`Rigor ${request.overallScore}/100`];
  if (request.recalculatedGPA) parts.push(`GPA ${request.recalculatedGPA}`);
  if (request.testScores?.satReading && request.testScores?.satMath) {
    parts.push(`SAT ${request.testScores.satReading + request.testScores.satMath}`);
  }
  if (request.testScores?.actComposite) parts.push(`ACT ${request.testScores.actComposite}`);
  return parts.join(", ");
}

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

// ── GPT call ──────────────────────────────────────────────────────────────────

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
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const result = JSON.parse(content) as { schools: RecommendedSchool[] };
    const raw = result.schools ?? [];

    const corrected = correctSchoolMetadata(raw);
    return deduplicateByName(corrected);
  } catch (err) {
    console.error("[GPT-Filter] Call failed:", err);
    return [];
  }
}

// ── Filter & validation helpers ───────────────────────────────────────────────

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

function correctSchoolMetadata(schools: RecommendedSchool[]): RecommendedSchool[] {
  return schools.map((s) => {
    let corrected = s;
    if (corrected.enrollment > 0) {
      const correctSize = getEnrollmentSize(corrected.enrollment);
      if (correctSize !== corrected.campusSize) {
        console.log(`[MetaCorrect] ${corrected.name}: campusSize "${corrected.campusSize}" → "${correctSize}" (enrollment=${corrected.enrollment})`);
        corrected = { ...corrected, campusSize: correctSize };
      }
    }
    const correctRegion = getSchoolRegion(corrected.name);
    if (correctRegion && correctRegion !== corrected.region) {
      console.log(`[MetaCorrect] ${corrected.name}: region "${corrected.region}" → "${correctRegion}"`);
      corrected = { ...corrected, region: correctRegion };
    }
    if (isTestRequiredSchool(corrected.name) && corrected.testPolicy !== "Test Required") {
      console.log(`[MetaCorrect] ${corrected.name}: testPolicy "${corrected.testPolicy}" → "Test Required"`);
      corrected = { ...corrected, testPolicy: "Test Required" as TestPolicyType };
    }
    return corrected;
  });
}

function preFilterPool(
  schools: RecommendedSchool[],
  regions: RegionType[],
  sizes: CampusSizeType[],
  policies: TestPolicyType[],
): RecommendedSchool[] {
  if (regions.length === 0 && sizes.length === 0 && policies.length === 0) return schools;

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

function verifyFinalEnrollment(
  schools: RecommendedSchool[],
  sizes: CampusSizeType[],
  regions: RegionType[],
  policies: TestPolicyType[],
): RecommendedSchool[] {
  if (sizes.length === 0 && regions.length === 0 && policies.length === 0) return schools;

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

function enforceFilterGate(
  schools: RecommendedSchool[],
  regions: RegionType[],
  sizes: CampusSizeType[],
  policies: TestPolicyType[],
): RecommendedSchool[] {
  if (regions.length === 0 && sizes.length === 0 && policies.length === 0) {
    return schools;
  }

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
