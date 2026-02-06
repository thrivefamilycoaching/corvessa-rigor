import type { RecommendedSchool, TestScores } from "@/lib/types";

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

// ── Protected Reach List ("Duke Guard") ──────────────────────────────────────
// These schools are ALWAYS forced to "reach" with max 15% probability,
// regardless of any other calculation. No exceptions.

const PROTECTED_REACH_LIST = [
  "Harvard",
  "Yale",
  "Princeton",
  "Columbia",
  "Brown",
  "Dartmouth",
  "Cornell",
  "University of Pennsylvania",
  "Penn",
  "Duke",
  "Stanford",
  "MIT",
  "Massachusetts Institute of Technology",
  "Caltech",
  "California Institute of Technology",
  "University of Chicago",
  "UChicago",
  "Northwestern",
  "Johns Hopkins",
  "Georgetown",
  "Rice",
  "Vanderbilt",
  "Notre Dame",
  "Emory",
  "Washington University",
  "WashU",
];

export function isProtectedReach(name: string): boolean {
  const lower = name.toLowerCase();
  return PROTECTED_REACH_LIST.some((p) => lower.includes(p.toLowerCase()));
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

// ── Probability calculation ──────────────────────────────────────────────────

export function calculateProbability(
  scorecard: ScorecardSchool,
  testScores?: TestScores
): number {
  const admissionRate =
    scorecard["latest.admissions.admission_rate.overall"];

  // If no admission rate data, we can't calculate
  if (admissionRate == null) return -1;

  // Layer 1: Base probability from admission rate (as percentage)
  let probability = admissionRate * 100;

  // Layer 2: SAT adjustment
  const sat25R = scorecard["latest.admissions.sat_scores.25th_percentile.critical_reading"];
  const sat75R = scorecard["latest.admissions.sat_scores.75th_percentile.critical_reading"];
  const sat25M = scorecard["latest.admissions.sat_scores.25th_percentile.math"];
  const sat75M = scorecard["latest.admissions.sat_scores.75th_percentile.math"];

  const hasScorecardSAT = sat25R != null && sat75R != null && sat25M != null && sat75M != null;
  const studentSATTotal =
    testScores?.satReading && testScores?.satMath
      ? testScores.satReading + testScores.satMath
      : null;

  if (hasScorecardSAT && studentSATTotal) {
    const school25 = sat25R! + sat25M!;
    const school75 = sat75R! + sat75M!;

    let multiplier: number;

    if (studentSATTotal < school25) {
      // Below 25th percentile: 0.3–0.7 (linear interpolation)
      // At 0 → 0.3, at school25 → 0.7
      const ratio = Math.max(0, studentSATTotal / school25);
      multiplier = 0.3 + ratio * 0.4;
    } else if (studentSATTotal <= school75) {
      // Within 25th–75th: 0.7–1.5 (linear interpolation)
      const range = school75 - school25;
      const ratio = range > 0 ? (studentSATTotal - school25) / range : 0.5;
      multiplier = 0.7 + ratio * 0.8;
    } else {
      // Above 75th: 1.5–2.5 (linear interpolation, capped)
      const overshoot = studentSATTotal - school75;
      const scale = Math.min(overshoot / 200, 1); // 200 points above 75th → max boost
      multiplier = 1.5 + scale * 1.0;
    }

    probability *= multiplier;
  } else if (!studentSATTotal) {
    // No student SAT: slight boost (GPT already matched on rigor)
    probability *= 1.1;
  }
  // If school has no SAT data but student does, skip SAT adjustment (admission-rate-only)

  // Layer 4: Elite cap — 15% max for elite schools or sub-15% admission rate
  if (admissionRate < 0.15) {
    probability = Math.min(probability, 15);
  }

  // Clamp to [1, 95]
  return Math.round(Math.max(1, Math.min(95, probability)));
}

// ── Deterministic classification (strict math, no LLM) ──────────────────────

function classifyCollege(
  schoolName: string,
  admissionRate: number | null,
  scorecard: ScorecardSchool | null,
  testScores?: TestScores
): "reach" | "match" | "safety" {
  // RULE 0 — Protected Reach List overrides everything
  if (isProtectedReach(schoolName)) {
    return "reach";
  }

  // RULE 1 — Sub-15% admission rate is ALWAYS reach
  if (admissionRate != null && admissionRate < 0.15) {
    return "reach";
  }

  // RULE 2 — Check student stats vs school's 75th percentile for safety
  if (admissionRate != null && admissionRate > 0.50 && scorecard) {
    const sat75R = scorecard["latest.admissions.sat_scores.75th_percentile.critical_reading"];
    const sat75M = scorecard["latest.admissions.sat_scores.75th_percentile.math"];
    const studentSATTotal =
      testScores?.satReading && testScores?.satMath
        ? testScores.satReading + testScores.satMath
        : null;

    if (studentSATTotal && sat75R != null && sat75M != null) {
      const school75 = sat75R + sat75M;
      if (studentSATTotal > school75) {
        return "safety";
      }
    }
  }

  // RULE 3 — Sub-20% admission rate is reach (even if not on protected list)
  if (admissionRate != null && admissionRate < 0.20) {
    return "reach";
  }

  // RULE 4 — Fallback: use admission rate bands
  if (admissionRate != null) {
    if (admissionRate > 0.50) return "safety";
    if (admissionRate >= 0.20) return "match";
    return "reach";
  }

  // No data — default to match
  return "match";
}

// ── Main enrichment function ─────────────────────────────────────────────────

export async function enrichSchoolsWithScorecardData(
  schools: RecommendedSchool[],
  testScores?: TestScores
): Promise<RecommendedSchool[]> {
  const apiKey = process.env.COLLEGE_SCORECARD_API_KEY;

  if (!apiKey) {
    console.log("[Scorecard] No COLLEGE_SCORECARD_API_KEY — keeping GPT estimates");
    return schools;
  }

  console.log(`[Scorecard] Enriching ${schools.length} schools with real data...`);

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

    // Protected Reach List — force reach + 15% cap, no exceptions
    if (isProtectedReach(school.name)) {
      const cappedProb = Math.min(calculateProbability(scorecard, testScores), 15);
      const finalProb = Math.max(1, cappedProb);
      console.log(`[Scorecard] ${school.name}: PROTECTED REACH — forced reach, probability=${finalProb}%`);
      return {
        ...school,
        acceptanceProbability: finalProb,
        type: "reach" as const,
      };
    }

    const probability = calculateProbability(scorecard, testScores);
    if (probability < 0) {
      console.log(`[Scorecard] ${school.name}: calculation failed — keeping GPT estimate`);
      return school;
    }

    // Sub-15% admission rate schools also capped at 15%
    let finalProbability = probability;
    if (admissionRate < 0.15 && finalProbability > 15) {
      console.log(`[Scorecard] ${school.name}: sub-15% admit rate cap (${finalProbability}% → 15%)`);
      finalProbability = 15;
    }

    const type = classifyCollege(school.name, admissionRate, scorecard, testScores);

    console.log(
      `[Scorecard] ${school.name}: admission=${(admissionRate * 100).toFixed(1)}% → probability=${finalProbability}% (${type})`
    );

    return {
      ...school,
      acceptanceProbability: finalProbability,
      type,
    };
  });

  return enriched;
}
