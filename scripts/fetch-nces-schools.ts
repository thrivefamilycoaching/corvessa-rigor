/**
 * Fetch NCES high school data and generate per-state JSON files.
 *
 * Data source: Urban Institute Education Data Portal
 * API docs: https://educationdata.urban.org/documentation/
 *
 * Usage: npx tsx scripts/fetch-nces-schools.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const API_BASE = "https://educationdata.urban.org/api/v1/schools/ccd/directory/2022/";
const OUT_DIR = join(__dirname, "..", "public", "data", "schools");

// FIPS state codes → postal abbreviations
const STATE_FIPS: Record<number, string> = {
  1: "AL", 2: "AK", 4: "AZ", 5: "AR", 6: "CA", 8: "CO", 9: "CT",
  10: "DE", 11: "DC", 12: "FL", 13: "GA", 15: "HI", 16: "ID",
  17: "IL", 18: "IN", 19: "IA", 20: "KS", 21: "KY", 22: "LA",
  23: "ME", 24: "MD", 25: "MA", 26: "MI", 27: "MN", 28: "MS",
  29: "MO", 30: "MT", 31: "NE", 32: "NV", 33: "NH", 34: "NJ",
  35: "NM", 36: "NY", 37: "NC", 38: "ND", 39: "OH", 40: "OK",
  41: "OR", 42: "PA", 44: "RI", 45: "SC", 46: "SD", 47: "TN",
  48: "TX", 49: "UT", 50: "VT", 51: "VA", 53: "WA", 54: "WV",
  55: "WI", 56: "WY",
};

interface ApiSchool {
  school_name: string;
  city_location: string;
  enrollment: number | null;
  school_level: number;
  school_type: number;
  school_status: number;
}

interface SchoolEntry {
  name: string;
  city: string;
}

async function fetchPage(url: string, retries = 3): Promise<{ results: ApiSchool[]; next: string | null }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      return { results: data.results || [], next: data.next || null };
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  Retry ${attempt}/${retries} for ${url}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return { results: [], next: null };
}

async function fetchStateSchools(fips: number, stateCode: string): Promise<SchoolEntry[]> {
  const schools: SchoolEntry[] = [];
  // school_level=3 → high school, school_type=1 → regular, school_status=1 → open
  let url: string | null = `${API_BASE}?fips=${fips}&school_level=3&school_type=1&school_status=1`;

  while (url) {
    const { results, next } = await fetchPage(url);
    for (const s of results) {
      if (s.school_name && s.city_location) {
        // Clean up ALL-CAPS names to Title Case
        const name = toTitleCase(s.school_name.trim());
        const city = toTitleCase(s.city_location.trim());
        schools.push({ name, city });
      }
    }
    url = next;
  }

  // Sort alphabetically by name
  schools.sort((a, b) => a.name.localeCompare(b.name));

  // Deduplicate by name+city
  const seen = new Set<string>();
  return schools.filter((s) => {
    const key = `${s.name}|${s.city}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toTitleCase(str: string): string {
  // If already mixed case, leave it alone
  if (str !== str.toUpperCase() && str !== str.toLowerCase()) return str;

  const lowerWords = new Set(["of", "the", "and", "at", "in", "for", "a", "an", "or"]);
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (i === 0 || !lowerWords.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(" ");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const fipsCodes = Object.keys(STATE_FIPS).map(Number).sort((a, b) => a - b);
  let totalSchools = 0;

  for (const fips of fipsCodes) {
    const stateCode = STATE_FIPS[fips];
    process.stdout.write(`Fetching ${stateCode} (FIPS ${fips})...`);

    try {
      const schools = await fetchStateSchools(fips, stateCode);
      const outPath = join(OUT_DIR, `${stateCode}.json`);
      writeFileSync(outPath, JSON.stringify(schools));
      totalSchools += schools.length;
      console.log(` ${schools.length} schools`);
    } catch (err) {
      console.error(` FAILED: ${err}`);
    }

    // Small delay between states to be kind to the API
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone! ${totalSchools} schools across ${fipsCodes.length} states/territories.`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
