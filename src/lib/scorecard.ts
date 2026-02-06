import type { RecommendedSchool, TestScores } from "@/lib/types";

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
// RULE 3 — Odds-to-label sync: <25% → Reach, 25-60% → Match, >60% → Safety.
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
  if (personalizedOdds > 60) category = "safety";
  else if (personalizedOdds >= 25) category = "match";
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
    return schools;
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

    // Sub-25% admit rate → cap at 24% (guaranteed Reach via <25% guard)
    if (admissionRate < 0.25) {
      finalOdds = Math.min(finalOdds, 24);
    }

    // DETERMINISTIC CLASSIFICATION — data overrides AI, no exceptions
    const type = classifyDeterministic(school.name, finalOdds, admissionRate, studentGPA);

    // FINAL SAFETY NET: if odds < 25%, label CANNOT be Safety or Match
    // This prevents any "9% chance — Safety" anomalies
    if (finalOdds < 25 && type !== "reach") {
      console.log(`[Scorecard] ${school.name}: SAFETY NET — odds=${finalOdds}% too low for "${type}", forcing reach`);
    }
    const guardedType = finalOdds < 25 ? "reach" : type;

    console.log(
      `[Scorecard] ${school.name}: admit_rate=${(admissionRate * 100).toFixed(1)}% GPA=${studentGPA} → YOUR ODDS=${finalOdds}% (${guardedType})`
    );

    return {
      ...school,
      acceptanceProbability: finalOdds,
      type: guardedType,
    };
  });

  return enriched;
}
