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

// ── Elite school list ────────────────────────────────────────────────────────

const ELITE_SCHOOLS = [
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
];

export function isEliteSchool(name: string): boolean {
  const lower = name.toLowerCase();
  return ELITE_SCHOOLS.some((elite) => lower.includes(elite.toLowerCase()));
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

// ── Tiered categorization ────────────────────────────────────────────────────

function categorizeSchool(
  probability: number,
  admissionRate: number | null,
  scorecard: ScorecardSchool | null,
  testScores?: TestScores
): "reach" | "match" | "safety" {
  if (scorecard && admissionRate != null) {
    const sat25R = scorecard["latest.admissions.sat_scores.25th_percentile.critical_reading"];
    const sat25M = scorecard["latest.admissions.sat_scores.25th_percentile.math"];
    const sat75R = scorecard["latest.admissions.sat_scores.75th_percentile.critical_reading"];
    const sat75M = scorecard["latest.admissions.sat_scores.75th_percentile.math"];

    const studentSATTotal =
      testScores?.satReading && testScores?.satMath
        ? testScores.satReading + testScores.satMath
        : null;

    if (studentSATTotal && sat25R != null && sat25M != null && sat75R != null && sat75M != null) {
      const school25 = sat25R + sat25M;
      const school75 = sat75R + sat75M;

      // Reach: below 25th percentile OR admission rate < 20%
      if (studentSATTotal < school25 || admissionRate < 0.20) {
        return "reach";
      }
      // Safety: above 75th percentile AND admission rate > 50%
      if (studentSATTotal > school75 && admissionRate > 0.50) {
        return "safety";
      }
      // Match: everything else (within 25th–75th)
      return "match";
    }
  }

  // Fallback to probability-based categorization
  if (probability > 70) return "safety";
  if (probability >= 40) return "match";
  return "reach";
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

    if (admissionRate == null) {
      console.log(`[Scorecard] ${school.name}: no admission rate data — keeping GPT estimate`);
      return school;
    }

    const probability = calculateProbability(scorecard, testScores);
    if (probability < 0) {
      console.log(`[Scorecard] ${school.name}: calculation failed — keeping GPT estimate`);
      return school;
    }

    // Apply elite cap
    let finalProbability = probability;
    if (isEliteSchool(school.name) && finalProbability > 15) {
      console.log(`[Scorecard] ${school.name}: elite cap applied (${finalProbability}% → 15%)`);
      finalProbability = 15;
    }

    const type = categorizeSchool(finalProbability, admissionRate, scorecard, testScores);

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
