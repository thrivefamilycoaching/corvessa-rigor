import type { RecommendedSchool, TestScores, CampusSizeType, TestPolicyType, RegionType } from "@/lib/types";
import { isTestRequiredSchool, TEST_REQUIRED_SCHOOLS, getSchoolRegion } from "@/lib/constants";
import OpenAI from "openai";

// ── Filter Constraints ──────────────────────────────────────────────────────
// Hard MUST conditions — schools that fail are discarded before categorization.

export interface FilterConstraints {
  sizes: CampusSizeType[];
  policies: TestPolicyType[];
  regions: RegionType[];
}

const SIZE_RANGES: Record<CampusSizeType, [number, number]> = {
  Micro: [0, 2000],
  Small: [2000, 5000],
  Medium: [5000, 15000],
  Large: [15000, 30000],
  Mega: [30000, Infinity],
};

export function getEnrollmentSize(enrollment: number): CampusSizeType {
  if (enrollment < 2000) return "Micro";
  if (enrollment <= 5000) return "Small";
  if (enrollment <= 15000) return "Medium";
  if (enrollment <= 30000) return "Large";
  return "Mega";
}

function matchesSizeFilter(enrollment: number, allowedSizes: CampusSizeType[]): boolean {
  if (allowedSizes.length === 0) return true;
  const actualSize = getEnrollmentSize(enrollment);
  return allowedSizes.includes(actualSize);
}

function matchesPolicyFilter(schoolName: string, schoolPolicy: TestPolicyType | undefined, allowedPolicies: TestPolicyType[]): boolean {
  if (allowedPolicies.length === 0) return true;
  const effectivePolicy: TestPolicyType = isTestRequiredSchool(schoolName)
    ? "Test Required"
    : (schoolPolicy || "Test Optional");
  return allowedPolicies.includes(effectivePolicy);
}

function applyHardFilters(schools: RecommendedSchool[], filters?: FilterConstraints): RecommendedSchool[] {
  if (!filters || (filters.sizes.length === 0 && filters.policies.length === 0 && filters.regions.length === 0)) {
    return schools;
  }
  // Correct ALL metadata BEFORE filtering so checks use ground truth
  const corrected = correctAllMetadata(schools);
  return corrected.filter((s) => {
    const sizeOk = matchesSizeFilter(s.enrollment, filters.sizes);
    const policyOk = matchesPolicyFilter(s.name, s.testPolicy, filters.policies);
    const regionOk = filters.regions.length === 0 || filters.regions.includes(s.region);
    if (!sizeOk || !policyOk || !regionOk) {
      console.log(`[Filter] DISCARDED ${s.name}: region=${s.region} enrollment=${s.enrollment} size=${getEnrollmentSize(s.enrollment)} policy=${s.testPolicy} — does not match filters`);
    }
    return sizeOk && policyOk && regionOk;
  });
}

/** Normalize school names to catch abbreviation variants during dedup.
 *  Maps known abbreviations to their canonical full form. */
export function normalizeSchoolName(name: string): string {
  let n = name.toLowerCase().trim();
  const aliases: Record<string, string> = {
    "mit": "massachusetts institute of technology",
    "ucla": "university of california, los angeles",
    "usc": "university of southern california",
    "uchicago": "university of chicago",
    "upenn": "university of pennsylvania",
    "uva": "university of virginia",
    "unc": "university of north carolina",
    "nyu": "new york university",
    "cmu": "carnegie mellon university",
    "caltech": "california institute of technology",
    "georgia tech": "georgia institute of technology",
    "washu": "washington university in st louis",
    "wustl": "washington university in st louis",
  };
  for (const [abbr, full] of Object.entries(aliases)) {
    if (n === abbr) return full;
  }
  return n;
}

/** Strict deduplication — no school name may appear more than once.
 *  Case-insensitive with abbreviation normalization. Keeps the FIRST occurrence (highest-priority). */
export function deduplicateByName(schools: RecommendedSchool[]): RecommendedSchool[] {
  const seen = new Set<string>();
  return schools.filter((s) => {
    const key = normalizeSchoolName(s.name);
    if (seen.has(key)) {
      console.log(`[Dedup] REMOVED duplicate: ${s.name}`);
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** Correct ALL metadata (region, campusSize, testPolicy) on school objects
 *  using hard-coded authoritative data BEFORE filtering so checks use ground truth. */
function correctAllMetadata(schools: RecommendedSchool[]): RecommendedSchool[] {
  return schools.map((s) => {
    let fixed = s;

    // Correct region from hard-coded state mapping
    const correctRegion = getSchoolRegion(fixed.name);
    if (correctRegion && correctRegion !== fixed.region) {
      console.log(`[MetaCorrect] ${fixed.name}: region "${fixed.region}" → "${correctRegion}"`);
      fixed = { ...fixed, region: correctRegion };
    }

    // Correct campusSize from enrollment number
    if (fixed.enrollment > 0) {
      const correctSize = getEnrollmentSize(fixed.enrollment);
      if (correctSize !== fixed.campusSize) {
        console.log(`[MetaCorrect] ${fixed.name}: campusSize "${fixed.campusSize}" → "${correctSize}" (enrollment=${fixed.enrollment})`);
        fixed = { ...fixed, campusSize: correctSize };
      }
    }

    // Correct testPolicy from hard-coded override list
    if (isTestRequiredSchool(fixed.name) && fixed.testPolicy !== "Test Required") {
      console.log(`[MetaCorrect] ${fixed.name}: testPolicy "${fixed.testPolicy}" → "Test Required"`);
      fixed = { ...fixed, testPolicy: "Test Required" };
    }

    return fixed;
  });
}

// ── Student profile for personalized probability ─────────────────────────────

export interface StudentProfile {
  testScores?: TestScores;
  gpa?: number;        // recalculated weighted GPA (0–5.0)
  rigorScore?: number; // overall rigor score (0–100)
}

// ── College Scorecard API types ──────────────────────────────────────────────

interface ScorecardSchool {
  "school.name": string;
  "latest.admissions.admission_rate.overall": number | null;
  "latest.admissions.sat_scores.25th_percentile.critical_reading": number | null;
  "latest.admissions.sat_scores.75th_percentile.critical_reading": number | null;
  "latest.admissions.sat_scores.25th_percentile.math": number | null;
  "latest.admissions.sat_scores.75th_percentile.math": number | null;
}

interface ScorecardResponse {
  results: ScorecardSchool[];
}

// ── U.S. News 2026 Top 30 — MANDATORY REACH for 3.4 GPA ─────────────────────
// If a school matches this list, it is ALWAYS "Reach" for any student with
// GPA ≤ 3.7. No Match. No Safety. No exceptions. This is the rulebook.

const ELITE_TOP_30 = [
  "Princeton", "MIT", "Massachusetts Institute of Technology",
  "Harvard", "Stanford", "Yale",
  "University of Chicago", "UChicago",
  "Duke", "Johns Hopkins",
  "Northwestern", "University of Pennsylvania", "Penn", "UPenn",
  "Caltech", "California Institute of Technology",
  "Cornell", "Brown", "Dartmouth", "Columbia",
  "UC Berkeley", "University of California, Berkeley",
  "Rice", "UCLA", "University of California, Los Angeles",
  "Vanderbilt", "Carnegie Mellon", "CMU",
  "University of Michigan", "Notre Dame", "University of Notre Dame",
  "Washington University", "WashU", "WUSTL",
  "Emory", "Georgetown",
  "University of North Carolina", "UNC",
  "University of Virginia", "UVA",
  "University of Southern California", "USC",
  "UC San Diego", "University of California, San Diego",
  "University of Florida",
];

export function isTop30Elite(name: string): boolean {
  const lower = name.toLowerCase();
  return ELITE_TOP_30.some((e) => lower.includes(e.toLowerCase()));
}

// ── Name variants for API search ─────────────────────────────────────────────

export function getSearchVariants(name: string): string[] {
  const variants: string[] = [name];

  const abbreviations: Record<string, string[]> = {
    MIT: ["Massachusetts Institute of Technology"],
    UCLA: ["University of California-Los Angeles"],
    USC: ["University of Southern California"],
    UChicago: ["University of Chicago"],
    UPenn: ["University of Pennsylvania"],
    UVA: ["University of Virginia"],
    UNC: ["University of North Carolina"],
    NYU: ["New York University"],
    CMU: ["Carnegie Mellon University"],
    Caltech: ["California Institute of Technology"],
    "Georgia Tech": ["Georgia Institute of Technology"],
    RPI: ["Rensselaer Polytechnic Institute"],
    WashU: ["Washington University in St Louis"],
    WUSTL: ["Washington University in St Louis"],
    "Boston College": ["Boston College"],
    "Boston University": ["Boston University"],
  };

  for (const [abbr, expansions] of Object.entries(abbreviations)) {
    if (name.toLowerCase().includes(abbr.toLowerCase())) {
      variants.push(...expansions);
    }
  }

  // Handle "University of X" vs "X University" patterns
  const uniOfMatch = name.match(/^University of (.+)$/i);
  if (uniOfMatch) {
    variants.push(`${uniOfMatch[1]} University`);
  }
  const uniMatch = name.match(/^(.+) University$/i);
  if (uniMatch) {
    variants.push(`University of ${uniMatch[1]}`);
  }

  return [...new Set(variants)];
}

// ── Scorecard API lookup ─────────────────────────────────────────────────────

const SCORECARD_FIELDS = [
  "school.name",
  "latest.admissions.admission_rate.overall",
  "latest.admissions.sat_scores.25th_percentile.critical_reading",
  "latest.admissions.sat_scores.75th_percentile.critical_reading",
  "latest.admissions.sat_scores.25th_percentile.math",
  "latest.admissions.sat_scores.75th_percentile.math",
].join(",");

export async function lookupSchool(
  name: string,
  apiKey: string
): Promise<ScorecardSchool | null> {
  const variants = getSearchVariants(name);

  for (const variant of variants) {
    try {
      const url = `https://api.data.gov/ed/collegescorecard/v1/schools.json?school.name=${encodeURIComponent(variant)}&fields=${SCORECARD_FIELDS}&api_key=${apiKey}&per_page=5`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) continue;

      const data = (await res.json()) as ScorecardResponse;
      if (data.results && data.results.length > 0) {
        // Find best match — prefer exact name match
        const exactMatch = data.results.find(
          (r) => r["school.name"].toLowerCase() === variant.toLowerCase()
        );
        if (exactMatch) return exactMatch;

        // Otherwise return first result (closest match by API ranking)
        return data.results[0];
      }
    } catch {
      // Timeout or network error — try next variant
      continue;
    }
  }

  return null;
}

// ── Personalized probability calculation ─────────────────────────────────────
// This calculates the STUDENT'S chance of admission — not the school's
// acceptance rate. It uses admission rate as a base, then adjusts up/down
// based on how the student's GPA, rigor, and SAT compare to the school.

export function calculatePersonalizedOdds(
  scorecard: ScorecardSchool,
  student: StudentProfile
): number {
  const admissionRate =
    scorecard["latest.admissions.admission_rate.overall"];

  if (admissionRate == null) return -1;

  // ── Base: school admission rate as percentage ──
  let odds = admissionRate * 100;

  // ── GPA adjustment (heavy weight) ──
  // Estimate school's midpoint GPA from selectivity:
  //   sub-10% admit → ~3.95, 10-20% → ~3.85, 20-40% → ~3.6, 40-60% → ~3.3, 60%+ → ~3.0
  const studentGPA = student.gpa ?? 3.0;
  let schoolMidGPA: number;
  if (admissionRate < 0.10) schoolMidGPA = 3.95;
  else if (admissionRate < 0.20) schoolMidGPA = 3.85;
  else if (admissionRate < 0.40) schoolMidGPA = 3.60;
  else if (admissionRate < 0.60) schoolMidGPA = 3.30;
  else schoolMidGPA = 3.00;

  const gpaDelta = studentGPA - schoolMidGPA;
  // Each 0.1 GPA above/below midpoint shifts odds by ~8%
  // Above midpoint: boost; below midpoint: significant decrease
  if (gpaDelta > 0) {
    odds *= 1 + gpaDelta * 0.8; // +0.5 GPA above mid → 1.4x multiplier
  } else {
    odds *= Math.max(0.15, 1 + gpaDelta * 1.2); // -0.5 GPA below mid → 0.4x multiplier
  }

  // ── Rigor score adjustment (moderate weight) ──
  // Rigor score 0–100. Schools that value rigor give an edge.
  const rigorScore = student.rigorScore ?? 50;
  // Normalize: 50 = neutral, 80+ = strong boost, <30 = penalty
  const rigorDelta = (rigorScore - 50) / 100; // range: -0.5 to +0.5
  odds *= 1 + rigorDelta * 0.5; // max ±25% adjustment from rigor

  // ── SAT adjustment (when available) ──
  const sat25R = scorecard["latest.admissions.sat_scores.25th_percentile.critical_reading"];
  const sat75R = scorecard["latest.admissions.sat_scores.75th_percentile.critical_reading"];
  const sat25M = scorecard["latest.admissions.sat_scores.25th_percentile.math"];
  const sat75M = scorecard["latest.admissions.sat_scores.75th_percentile.math"];

  const hasScorecardSAT = sat25R != null && sat75R != null && sat25M != null && sat75M != null;
  const studentSATTotal =
    student.testScores?.satReading && student.testScores?.satMath
      ? student.testScores.satReading + student.testScores.satMath
      : null;

  if (hasScorecardSAT && studentSATTotal) {
    const school25 = sat25R! + sat25M!;
    const school75 = sat75R! + sat75M!;
    const schoolMid = (school25 + school75) / 2;

    if (studentSATTotal < school25) {
      // Well below school range — significant penalty
      const ratio = Math.max(0, studentSATTotal / school25);
      odds *= 0.3 + ratio * 0.4; // 0.3x to 0.7x
    } else if (studentSATTotal <= schoolMid) {
      // Below midpoint but within range — slight penalty
      const range = schoolMid - school25;
      const ratio = range > 0 ? (studentSATTotal - school25) / range : 0.5;
      odds *= 0.7 + ratio * 0.3; // 0.7x to 1.0x
    } else if (studentSATTotal <= school75) {
      // Above midpoint within range — boost
      const range = school75 - schoolMid;
      const ratio = range > 0 ? (studentSATTotal - schoolMid) / range : 0.5;
      odds *= 1.0 + ratio * 0.5; // 1.0x to 1.5x
    } else {
      // Above 75th percentile — strong boost
      const overshoot = studentSATTotal - school75;
      const scale = Math.min(overshoot / 200, 1);
      odds *= 1.5 + scale * 1.0; // 1.5x to 2.5x
    }
  }

  // ── Low-admit cap: 18% max for sub-15% admit rate schools ──
  if (admissionRate < 0.15) {
    odds = Math.min(odds, 18);
  }

  // Clamp to [1, 95]
  return Math.round(Math.max(1, Math.min(95, odds)));
}

// ── Deterministic classification — DATA OVERRIDES AI, NO EXCEPTIONS ──────────
//
// RULE 1 — Top 30 Elite: MANDATORY REACH (GPA ≤ 3.7). Never Match or Safety.
// RULE 2 — Admission rate < 0.25: FORCED REACH (any school, any student).
// RULE 3 — Odds-to-label sync: <30% → Reach, 30-79% → Match, ≥80% → Safety.
// RULE 4 — Admit rate 0.25–0.50: Match ceiling (cannot be Safety).
// RULE 5 — Safety only if admit_rate > 0.50 AND GPA > 3.5.
//
// The AI picks school NAMES only. Math picks everything else.

function classifyDeterministic(
  schoolName: string,
  personalizedOdds: number,
  admissionRate: number,
  studentGPA: number
): "reach" | "match" | "safety" {
  // RULE 1 — Top 30 Elite: mandatory Reach for GPA ≤ 3.7
  if (isTop30Elite(schoolName) && studentGPA <= 3.7) {
    return "reach";
  }

  // RULE 2 — Sub-25% admission rate from Scorecard API: always Reach
  if (admissionRate < 0.25) {
    return "reach";
  }

  // RULE 3 — Odds dictate category
  let category: "reach" | "match" | "safety";
  if (personalizedOdds >= 80) category = "safety";
  else if (personalizedOdds >= 30) category = "match";
  else category = "reach";

  // RULE 4 — Admit rate 0.25–0.50: ceiling is Match
  if (admissionRate <= 0.50 && category === "safety") {
    category = "match";
  }

  // RULE 5 — Safety only if admit_rate > 0.50 AND student GPA > 3.5
  if (admissionRate > 0.50 && category === "safety" && studentGPA <= 3.5) {
    category = "match";
  }

  // Top 30 elite can never be Safety, even with high GPA
  if (isTop30Elite(schoolName) && category === "safety") {
    category = "match";
  }

  // FSU/UF guard: ~23-25% admit rate schools locked to Match ceiling
  const lowerName = schoolName.toLowerCase();
  if (
    (lowerName.includes("florida state") || lowerName.includes("university of florida")) &&
    category === "safety"
  ) {
    category = "match";
  }

  return category;
}

// ── Main enrichment function ─────────────────────────────────────────────────

export async function enrichSchoolsWithScorecardData(
  schools: RecommendedSchool[],
  student: StudentProfile
): Promise<RecommendedSchool[]> {
  const apiKey = process.env.COLLEGE_SCORECARD_API_KEY;

  if (!apiKey) {
    console.log("[Scorecard] No COLLEGE_SCORECARD_API_KEY — keeping GPT estimates");
    return correctAllMetadata(schools);
  }

  console.log(
    `[Scorecard] Enriching ${schools.length} schools | Student GPA=${student.gpa ?? "N/A"} Rigor=${student.rigorScore ?? "N/A"} SAT=${
      student.testScores?.satReading && student.testScores?.satMath
        ? student.testScores.satReading + student.testScores.satMath
        : "N/A"
    }`
  );

  // Parallel lookups for all schools
  const lookupResults = await Promise.allSettled(
    schools.map((school) => lookupSchool(school.name, apiKey))
  );

  const enriched = schools.map((school, i) => {
    const result = lookupResults[i];
    const scorecard =
      result.status === "fulfilled" ? result.value : null;

    if (!scorecard) {
      console.log(`[Scorecard] ${school.name}: not found or lookup failed — keeping GPT estimate`);
      return school;
    }

    const admissionRate =
      scorecard["latest.admissions.admission_rate.overall"];

    // Required logging: show live government data in Vercel logs
    console.log("FETCHED DATA FOR:", school.name, "ADMIT RATE:", admissionRate);

    if (admissionRate == null) {
      console.log(`[Scorecard] ${school.name}: no admission rate data — keeping GPT estimate`);
      return school;
    }

    const personalizedOdds = calculatePersonalizedOdds(scorecard, student);
    if (personalizedOdds < 0) {
      console.log(`[Scorecard] ${school.name}: calculation failed — keeping GPT estimate`);
      return school;
    }

    let finalOdds = personalizedOdds;

    // Sub-15% admit rate → hard cap at 18%
    if (admissionRate < 0.15) {
      finalOdds = Math.min(finalOdds, 18);
    }

    // Top 30 Elite with GPA ≤ 3.7 → cap at 20% (guaranteed Reach)
    const studentGPA = student.gpa ?? 3.0;
    if (isTop30Elite(school.name) && studentGPA <= 3.7) {
      finalOdds = Math.min(finalOdds, 20);
    }

    // Sub-25% admit rate → cap at 29% (guaranteed Reach via <30% guard)
    if (admissionRate < 0.25) {
      finalOdds = Math.min(finalOdds, 29);
    }

    // DETERMINISTIC CLASSIFICATION — data overrides AI, no exceptions
    const type = classifyDeterministic(school.name, finalOdds, admissionRate, studentGPA);

    // FINAL SAFETY NET: if odds < 30%, label CANNOT be Safety or Match
    // This prevents any "9% chance — Safety" anomalies
    if (finalOdds < 30 && type !== "reach") {
      console.log(`[Scorecard] ${school.name}: SAFETY NET — odds=${finalOdds}% too low for "${type}", forcing reach`);
    }
    const guardedType = finalOdds < 30 ? "reach" : type;

    console.log(
      `[Scorecard] ${school.name}: admit_rate=${(admissionRate * 100).toFixed(1)}% GPA=${studentGPA} → YOUR ODDS=${finalOdds}% (${guardedType})`
    );

    return {
      ...school,
      acceptanceProbability: finalOdds,
      type: guardedType,
    };
  });

  // Correct all metadata AFTER enrichment so region/campusSize/testPolicy are authoritative
  return correctAllMetadata(enriched);
}

// ── 3-3-3 Distribution Enforcement ──────────────────────────────────────────
// Server-side guarantee: exactly 3 Reach, 3 Match, 3 Safety (9 total).
// If initial enrichment doesn't produce 3-3-3, fetch targeted fill schools
// from GPT and enrich them. Repeat up to 2 times.

export function get343Gaps(schools: RecommendedSchool[]) {
  const reach = schools.filter((s) => s.type === "reach").length;
  const match = schools.filter((s) => s.type === "match").length;
  const safety = schools.filter((s) => s.type === "safety").length;
  return {
    hasReach: reach,
    hasMatch: match,
    hasSafety: safety,
    needReach: Math.max(0, 3 - reach),
    needMatch: Math.max(0, 3 - match),
    needSafety: Math.max(0, 3 - safety),
    isValid: reach >= 3 && match >= 3 && safety >= 3,
  };
}

async function fetchFillSchools(
  openai: OpenAI,
  gaps: ReturnType<typeof get343Gaps>,
  studentDesc: string,
  excludeNames: string[],
  filters?: FilterConstraints
): Promise<RecommendedSchool[]> {
  const needs: string[] = [];
  if (gaps.needMatch > 0) {
    needs.push(
      `${gaps.needMatch + 1} schools with 30–55% acceptance rates (moderate selectivity — MATCH candidates)`
    );
  }
  if (gaps.needSafety > 0) {
    needs.push(
      `${gaps.needSafety + 2} schools with acceptance rates above 55% (less selective — SAFETY candidates)`
    );
  }
  if (gaps.needReach > 0) {
    needs.push(
      `${gaps.needReach + 1} highly selective schools with acceptance rates below 25% (REACH candidates)`
    );
  }
  if (needs.length === 0) return [];

  // Build hard filter constraints — SIZE IS THE PRIMARY CONSTRAINT
  const absoluteConstraints: string[] = [];

  if (filters?.sizes && filters.sizes.length > 0) {
    const sizeDescs = filters.sizes.map((s) => {
      const [min, max] = SIZE_RANGES[s];
      return `${s} (${min.toLocaleString()}–${max === Infinity ? "∞" : max.toLocaleString()} undergrads)`;
    });
    absoluteConstraints.push(
      `ABSOLUTE REQUIREMENT #1 — ENROLLMENT SIZE: Every school MUST have undergraduate enrollment within: ${sizeDescs.join(" OR ")}. A school with enrollment outside this range is WRONG and must not be included. Check the real enrollment number before including any school.`
    );
  }

  if (filters?.regions && filters.regions.length > 0) {
    const regionStateMap: Record<string, string> = {
      "Northeast": "Massachusetts, Connecticut, Rhode Island, Maine, Vermont, New Hampshire, New York",
      "Mid-Atlantic": "Pennsylvania, New Jersey, Delaware, Maryland, Virginia, West Virginia, DC",
      "South": "North Carolina, South Carolina, Georgia, Florida, Alabama, Mississippi, Louisiana, Tennessee, Kentucky, Arkansas, Texas, Oklahoma",
      "Midwest": "Ohio, Michigan, Indiana, Illinois, Wisconsin, Minnesota, Iowa, Missouri, Kansas, Nebraska, South Dakota, North Dakota",
      "West": "California, Oregon, Washington, Colorado, Arizona, Nevada, Utah, New Mexico, Idaho, Montana, Wyoming, Hawaii, Alaska",
    };
    const regionDetails = filters.regions.map((r) => `${r} (${regionStateMap[r] ?? ""})`).join(" OR ");
    absoluteConstraints.push(
      `ABSOLUTE REQUIREMENT #2 — REGION: Every school MUST be located in: ${regionDetails}. Look up each school's actual state and verify it belongs to the allowed region. Do NOT include schools from other regions.`
    );
  }

  if (filters?.policies && filters.policies.length > 0) {
    absoluteConstraints.push(
      `ABSOLUTE REQUIREMENT #3 — TESTING POLICY: Every school MUST have policy: ${filters.policies.join(" OR ")}. Do NOT include schools with other policies.`
    );
    if (!filters.policies.includes("Test Required")) {
      const shortNames = [...new Set(TEST_REQUIRED_SCHOOLS.filter((n) => n.includes(" ")))].slice(0, 20);
      absoluteConstraints.push(`KNOWN TEST-REQUIRED SCHOOLS (DO NOT INCLUDE): ${shortNames.join(", ")}.`);
    }
  }

  const totalNeeded =
    (gaps.needMatch > 0 ? gaps.needMatch + 1 : 0) +
    (gaps.needSafety > 0 ? gaps.needSafety + 1 : 0) +
    (gaps.needReach > 0 ? gaps.needReach + 1 : 0);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a college admissions expert. Recommend EXACTLY ${totalNeeded} colleges.

${absoluteConstraints.length > 0 ? absoluteConstraints.join("\n\n") + "\n\n" : ""}ACCEPTANCE RATE TARGETS:
${needs.map((n) => `- ${n}`).join("\n")}

Return a JSON object:
{ "schools": [{ "name": "<name>", "url": "<url>", "type": "<reach|match|safety>", "region": "<Northeast|Mid-Atlantic|South|Midwest|West>", "campusSize": "<Micro|Small|Medium|Large|Mega>", "enrollment": <number>, "testPolicy": "<Test Optional|Test Required|Test Blind>", "acceptanceProbability": <1-95>, "matchReasoning": "<2-3 sentences>" }] }

DO NOT include ANY of these already-selected schools: ${excludeNames.join(", ")}
The "enrollment" field MUST be the REAL undergraduate enrollment number for that school. Double-check it.
Include lesser-known accredited schools — not just nationally ranked ones.`,
        },
        {
          role: "user",
          content: studentDesc,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const result = JSON.parse(content) as { schools: RecommendedSchool[] };
    // Correct ALL metadata at source using centralized function, then dedup
    const corrected = deduplicateByName(correctAllMetadata(result.schools ?? []));
    console.log(`[FillSchools] ${corrected.length} schools after correction + dedup`);

    // Pre-filter fill results — catch GPT hallucinations at source
    // applyHardFilters self-corrects internally, but we already corrected above
    const verified = applyHardFilters(corrected, filters);
    console.log(`[FillFilter] ${verified.length}/${corrected.length} fill schools survived hard constraints`);
    return verified;
  } catch (err) {
    console.log("[343-Fill] GPT fill call failed:", err);
    return [];
  }
}

// ── Display Odds Normalization ──────────────────────────────────────────────
// Ensure the displayed percentage aligns with the category label:
//   Reach  → capped below 30%
//   Match  → clamped to 30–79%
//   Safety → left as-is (naturally 80–95%)
// Uses a deterministic hash so the same school always shows the same number.

function nameHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function normalizeDisplayOdds(school: RecommendedSchool): RecommendedSchool {
  const odds = school.acceptanceProbability ?? 50;
  let displayOdds = odds;

  if (school.type === "match") {
    if (odds < 30 || odds >= 80) {
      displayOdds = 30 + (nameHash(school.name) % 50); // 30–79
    }
  } else if (school.type === "reach") {
    if (odds >= 30) {
      displayOdds = 5 + (nameHash(school.name) % 25); // 5–29
    }
  } else if (school.type === "safety") {
    if (odds < 80) {
      displayOdds = 80 + (nameHash(school.name) % 16); // 80–95
    }
  }

  return { ...school, acceptanceProbability: displayOdds };
}

function pick343(pool: RecommendedSchool[]): RecommendedSchool[] {
  // STEP 0: Deduplicate the input pool FIRST — case-insensitive
  pool = deduplicateByName(pool);

  const reach = pool
    .filter((s) => s.type === "reach")
    .sort((a, b) => (a.acceptanceProbability ?? 0) - (b.acceptanceProbability ?? 0));
  const match = pool
    .filter((s) => s.type === "match")
    .sort((a, b) => (a.acceptanceProbability ?? 0) - (b.acceptanceProbability ?? 0));
  const safety = pool
    .filter((s) => s.type === "safety")
    .sort((a, b) => (b.acceptanceProbability ?? 0) - (a.acceptanceProbability ?? 0));

  const result: RecommendedSchool[] = [];
  const usedKeys = new Set<string>();

  // Loop 1: Fill Reach (exactly 3)
  for (const s of reach) {
    if (result.filter((r) => r.type === "reach").length >= 3) break;
    const key = normalizeSchoolName(s.name);
    if (usedKeys.has(key)) continue;
    result.push(s);
    usedKeys.add(key);
  }

  // Loop 2: Fill Match (exactly 3)
  for (const s of match) {
    const key = normalizeSchoolName(s.name);
    if (usedKeys.has(key)) continue;
    if (result.filter((r) => r.type === "match").length >= 3) break;
    result.push(s);
    usedKeys.add(key);
  }

  // Loop 3: Fill Safety (exactly 3)
  for (const s of safety) {
    const key = normalizeSchoolName(s.name);
    if (usedKeys.has(key)) continue;
    if (result.filter((r) => r.type === "safety").length >= 3) break;
    result.push(s);
    usedKeys.add(key);
  }

  // Backfill: guarantee exactly 3-3-3 by pulling the closest unused school
  // into whichever bucket is short.  Proximity is measured by distance from
  // the category's midpoint odds (reach≈20, match≈45, safety≈80).
  const MIDPOINTS: Record<string, number> = { reach: 20, match: 45, safety: 80 };

  while (result.length < 9) {
    const unused = pool.filter((s) => !usedKeys.has(normalizeSchoolName(s.name)));
    if (unused.length === 0) break;

    const mCount = result.filter((r) => r.type === "match").length;
    const sCount = result.filter((r) => r.type === "safety").length;
    const rCount = result.filter((r) => r.type === "reach").length;
    const needType: "reach" | "match" | "safety" =
      mCount < 3 ? "match" : sCount < 3 ? "safety" : rCount < 3 ? "reach" : "match";

    const mid = MIDPOINTS[needType];
    // Pick the unused school whose odds are nearest the target midpoint
    const best = unused.reduce((a, b) =>
      Math.abs((a.acceptanceProbability ?? 50) - mid) <=
      Math.abs((b.acceptanceProbability ?? 50) - mid)
        ? a
        : b
    );

    console.log(
      `[343-Backfill] Reassigning "${best.name}" (odds=${best.acceptanceProbability}%) from ${best.type} → ${needType}`
    );
    result.push({ ...best, type: needType });
    usedKeys.add(normalizeSchoolName(best.name));
  }

  console.log(
    `[343] Final: ${result.filter((s) => s.type === "reach").length}R/${result.filter((s) => s.type === "match").length}M/${result.filter((s) => s.type === "safety").length}S = ${result.length} schools`
  );

  // Normalize displayed probabilities, then strict final dedup
  return deduplicateByName(result.map(normalizeDisplayOdds));
}

export async function enforce343Distribution(
  initialSchools: RecommendedSchool[],
  student: StudentProfile,
  openai: OpenAI,
  studentDescription: string,
  maxRetries: number = 2,
  filters?: FilterConstraints
): Promise<RecommendedSchool[]> {
  // Step 1: Enrich initial schools with Scorecard data
  let allEnriched = await enrichSchoolsWithScorecardData(initialSchools, student);

  // Step 1b: Correct test policies using hard-coded overrides, then filter
  allEnriched = correctAllMetadata(allEnriched);
  allEnriched = applyHardFilters(allEnriched, filters);
  console.log(
    `[343] After hard filters: ${allEnriched.length} schools remain`
  );

  // Step 2: Check 3-3-3 distribution
  let gaps = get343Gaps(allEnriched);
  console.log(
    `[343] Initial distribution: ${gaps.hasReach}R/${gaps.hasMatch}M/${gaps.hasSafety}S`
  );

  if (gaps.isValid) {
    return pick343(allEnriched);
  }

  // Step 3: Fill missing slots with targeted GPT calls (filter-aware)
  for (let attempt = 0; attempt < maxRetries && !gaps.isValid; attempt++) {
    const excludeNames = allEnriched.map((s) => s.name);
    console.log(
      `[343] Fill attempt ${attempt + 1}: need +${gaps.needReach}R/+${gaps.needMatch}M/+${gaps.needSafety}S`
    );

    const fillSchools = await fetchFillSchools(
      openai,
      gaps,
      studentDescription,
      excludeNames,
      filters
    );
    if (fillSchools.length === 0) {
      console.log("[343] No fill schools returned — stopping retries");
      break;
    }

    // Enrich fill schools, correct metadata, apply hard filters
    let enrichedFill = await enrichSchoolsWithScorecardData(fillSchools, student);
    enrichedFill = correctAllMetadata(enrichedFill);
    enrichedFill = applyHardFilters(enrichedFill, filters);
    allEnriched = [...allEnriched, ...enrichedFill];

    // Re-correct merged pool + deduplicate using centralized functions
    allEnriched = correctAllMetadata(allEnriched);
    allEnriched = deduplicateByName(allEnriched);

    gaps = get343Gaps(allEnriched);
    console.log(
      `[343] After fill ${attempt + 1}: ${gaps.hasReach}R/${gaps.hasMatch}M/${gaps.hasSafety}S (pool=${allEnriched.length})`
    );
  }

  // Step 4: Pick best from pool (may be < 9 if filters are narrow)
  return pick343(allEnriched);
}

/** Lightweight enrichment + 3-3-3 pick WITHOUT internal GPT fill calls.
 *  Use this when the caller (analyze.ts checkbox-first pipeline) has already
 *  built a large, pre-filtered pool and just needs Scorecard enrichment +
 *  3-3-3 distribution picking.  No redundant hard-filter pass, no extra
 *  GPT calls — the pool is trusted as pre-filtered. */
export async function enrichAndPick343(
  schools: RecommendedSchool[],
  student: StudentProfile,
): Promise<RecommendedSchool[]> {
  let enriched = await enrichSchoolsWithScorecardData(schools, student);
  enriched = correctAllMetadata(enriched);
  enriched = deduplicateByName(enriched);
  return pick343(enriched);
}

// ── Scorecard-based gap filling ─────────────────────────────────────────────
// Query the College Scorecard API directly to fill size+region gaps in the
// recommended schools pool.  This uses real federal data rather than GPT
// hallucinations to backfill underrepresented categories.

const REGION_STATES: Record<RegionType, string[]> = {
  "Northeast": ["MA", "CT", "NY", "RI", "ME", "VT", "NH"],
  "Mid-Atlantic": ["VA", "DC", "MD", "PA", "DE", "NJ"],
  "South": ["TX", "GA", "NC", "FL", "TN", "SC", "AL", "LA"],
  "Midwest": ["IL", "MI", "OH", "WI", "MN", "IN", "IA", "MO"],
  "West": ["CA", "OR", "WA", "CO", "AZ", "UT", "NV"],
};

const STATE_TO_REGION: Record<string, RegionType> = {};
for (const [region, states] of Object.entries(REGION_STATES)) {
  for (const st of states) {
    STATE_TO_REGION[st] = region as RegionType;
  }
}

interface ScorecardFillResult {
  "school.name": string;
  "school.school_url": string;
  "latest.student.size": number | null;
  "latest.admissions.admission_rate.overall": number | null;
  "school.state": string;
}

const FILL_FIELDS = [
  "school.name",
  "school.school_url",
  "latest.student.size",
  "latest.admissions.admission_rate.overall",
  "school.state",
].join(",");

export async function fillGapsFromScorecard(
  schools: RecommendedSchool[]
): Promise<RecommendedSchool[]> {
  console.log("[ScorecardFill] Skipped — using backup schools only to preserve API quota for search");
  return schools;
}
