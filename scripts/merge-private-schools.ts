/**
 * Parse NCES PSS (Private School Universe Survey) CSV data and merge
 * private/independent high schools into the existing per-state JSON files.
 *
 * Source: NCES PSS 2021-22 public-use data
 *   https://nces.ed.gov/surveys/pss/pssdata.asp
 *
 * Adds a "type" field: "public" for existing CCD schools, "private" for PSS schools.
 *
 * Usage: npx tsx scripts/merge-private-schools.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const PSS_CSV = join(__dirname, "pss2122", "pss2122_pu.csv");
const OUT_DIR = join(__dirname, "..", "public", "data", "schools");

interface SchoolEntry {
  name: string;
  city: string;
  type: "public" | "private";
}

// Column indices (0-based) from the PSS CSV header
// PINST=197, PCITY=199, PSTABB=200, HIGR2022=221, LEVEL=227
// We'll find them dynamically from the header

function toTitleCase(str: string): string {
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

/**
 * Parse CSV line respecting quoted fields.
 * PSS data uses quotes for fields containing commas.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function main() {
  console.log("Reading PSS CSV data...");
  const raw = readFileSync(PSS_CSV, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);

  // Parse header to find column indices
  const header = parseCSVLine(lines[0]);
  const colIndex: Record<string, number> = {};
  for (let i = 0; i < header.length; i++) {
    colIndex[header[i]] = i;
  }

  const iName = colIndex["PINST"];
  const iCity = colIndex["PCITY"];
  const iState = colIndex["PSTABB"];
  const iLevel = colIndex["LEVEL"];
  const iHiGrade = colIndex["HIGR2022"];

  if (iName === undefined || iCity === undefined || iState === undefined || iLevel === undefined || iHiGrade === undefined) {
    console.error("Missing required columns. Found:", Object.keys(colIndex).join(", "));
    process.exit(1);
  }

  console.log(`Column indices: PINST=${iName}, PCITY=${iCity}, PSTABB=${iState}, LEVEL=${iLevel}, HIGR2022=${iHiGrade}`);

  // Parse private schools grouped by state
  const privateByState: Record<string, SchoolEntry[]> = {};
  let parsed = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const level = fields[iLevel]?.trim();
    const hiGrade = fields[iHiGrade]?.trim();
    const state = fields[iState]?.trim();
    const name = fields[iName]?.trim();
    const city = fields[iCity]?.trim();

    if (!state || !name || !city) {
      skipped++;
      continue;
    }

    // Filter: LEVEL=2 (secondary) or LEVEL=3 (combined) with highest grade = 12th (code 17)
    const isSecondary = level === "2";
    const isCombinedWithHS = level === "3" && hiGrade === "17";
    if (!isSecondary && !isCombinedWithHS) {
      skipped++;
      continue;
    }

    const entry: SchoolEntry = {
      name: toTitleCase(name),
      city: toTitleCase(city),
      type: "private",
    };

    if (!privateByState[state]) privateByState[state] = [];
    privateByState[state].push(entry);
    parsed++;
  }

  console.log(`Parsed ${parsed} private high schools, skipped ${skipped} non-high-school entries`);

  // Now merge with existing public school data
  const states = Object.keys(privateByState).sort();
  let totalMerged = 0;

  for (const state of states) {
    const publicPath = join(OUT_DIR, `${state}.json`);
    let existing: SchoolEntry[] = [];

    try {
      const raw = readFileSync(publicPath, "utf-8");
      const parsed = JSON.parse(raw) as Array<{ name: string; city: string; type?: string }>;
      // Add type="public" to existing entries that don't have it
      existing = parsed.map((s) => ({
        name: s.name,
        city: s.city,
        type: (s.type as "public" | "private") || "public",
      }));
    } catch {
      // No existing file for this state — create from scratch
      existing = [];
    }

    const privateSchools = privateByState[state];

    // Deduplicate: don't add a private school if a public school with the same name+city exists
    const existingKeys = new Set(existing.map((s) => `${s.name.toLowerCase()}|${s.city.toLowerCase()}`));
    const newPrivate = privateSchools.filter((s) => {
      const key = `${s.name.toLowerCase()}|${s.city.toLowerCase()}`;
      return !existingKeys.has(key);
    });

    // Merge and sort alphabetically
    const merged = [...existing, ...newPrivate].sort((a, b) => a.name.localeCompare(b.name));

    // Deduplicate again by name+city (in case of any remaining dupes)
    const seen = new Set<string>();
    const deduped = merged.filter((s) => {
      const key = `${s.name.toLowerCase()}|${s.city.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    writeFileSync(publicPath, JSON.stringify(deduped));
    const publicCount = existing.length;
    const privateCount = newPrivate.length;
    totalMerged += deduped.length;
    console.log(`${state}: ${publicCount} public + ${privateCount} private = ${deduped.length} total`);
  }

  // Handle states that only had public schools (add type field)
  const allStates = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
    "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
    "VT","VA","WA","WV","WI","WY",
  ];

  for (const state of allStates) {
    if (states.includes(state)) continue; // Already processed above

    const publicPath = join(OUT_DIR, `${state}.json`);
    try {
      const raw = readFileSync(publicPath, "utf-8");
      const parsed = JSON.parse(raw) as Array<{ name: string; city: string; type?: string }>;
      if (parsed.length > 0 && !parsed[0].type) {
        // Add type="public" to existing entries
        const updated = parsed.map((s) => ({ name: s.name, city: s.city, type: "public" }));
        writeFileSync(publicPath, JSON.stringify(updated));
        console.log(`${state}: ${updated.length} public (type field added)`);
        totalMerged += updated.length;
      }
    } catch {
      // No file exists, skip
    }
  }

  console.log(`\nDone! ${totalMerged} total schools across all states.`);
}

main();
