import type { RegionType, CampusSizeType, TestPolicyType, SchoolPrograms } from "./types";

export const REGIONS: RegionType[] = ["Northeast", "Mid-Atlantic", "South", "Midwest", "West", "Canada"];

export const CAMPUS_SIZES: { value: CampusSizeType; label: string; range: string }[] = [
  { value: "Micro", label: "Micro", range: "<2K" },
  { value: "Small", label: "Small", range: "2K-5K" },
  { value: "Medium", label: "Medium", range: "5K-15K" },
  { value: "Large", label: "Large", range: "15K-30K" },
  { value: "Mega", label: "Mega", range: "30K+" },
];

export const TEST_POLICIES: { value: TestPolicyType; label: string; description: string }[] = [
  { value: "Test Optional", label: "Test Optional", description: "Scores considered if submitted" },
  { value: "Test Required", label: "Test Required", description: "Scores required for admission" },
  { value: "Test Blind", label: "Test Blind", description: "Scores not considered" },
];

export type ProgramFilterKey = keyof Omit<SchoolPrograms, "ncaaDivision">;

export const PROGRAM_FILTERS: { key: ProgramFilterKey; label: string }[] = [
  { key: "greekLife", label: "Greek Life" },
  { key: "rotc", label: "ROTC" },
  { key: "studyAbroad", label: "Study Abroad" },
  { key: "honorsCollege", label: "Honors College" },
  { key: "coopInternship", label: "Co-op/Internship" },
  { key: "preMed", label: "Pre-Med" },
  { key: "preLaw", label: "Pre-Law" },
  { key: "engineering", label: "Engineering" },
  { key: "nursing", label: "Nursing" },
  { key: "businessSchool", label: "Business School" },
  { key: "performingArts", label: "Performing Arts" },
];

// Hard-coded list of schools with STRICT Test Required policies
// These override any GPT-generated policy data
export const TEST_REQUIRED_SCHOOLS: string[] = [
  // Ivy League (all reinstated)
  "Harvard", "Harvard University",
  "Yale", "Yale University",
  "Princeton", "Princeton University",
  "Columbia", "Columbia University",
  "Penn", "University of Pennsylvania", "UPenn",
  "Brown", "Brown University",
  "Dartmouth", "Dartmouth College",
  "Cornell", "Cornell University",
  // Elite / Top-30 reinstated
  "MIT", "Massachusetts Institute of Technology",
  "Stanford", "Stanford University",
  "Caltech", "California Institute of Technology",
  "Georgetown", "Georgetown University",
  "Duke", "Duke University",
  "Vanderbilt", "Vanderbilt University",
  "Rice", "Rice University",
  "Johns Hopkins", "Johns Hopkins University",
  "Northwestern", "Northwestern University",
  "University of Chicago", "UChicago",
  "Carnegie Mellon", "Carnegie Mellon University", "CMU",
  "Emory", "Emory University",
  // Major publics — test required
  "Georgia Tech", "Georgia Institute of Technology",
  "Purdue", "Purdue University",
  "UT Austin", "University of Texas at Austin", "University of Texas",
  "University of Florida",
  "University of Tennessee",
  "University of Virginia", "UVA",
  "University of North Carolina", "UNC", "UNC Chapel Hill",
  "University of Georgia", "UGA",
  "Florida State", "Florida State University",
  "Virginia Tech", "Virginia Polytechnic",
  "Texas A&M", "Texas A&M University",
  "Clemson", "Clemson University",
];

// Authoritative state → region mapping for post-GPT region correction
export const STATE_TO_REGION: Record<string, RegionType> = {
  // Northeast
  "massachusetts": "Northeast", "connecticut": "Northeast", "rhode island": "Northeast",
  "maine": "Northeast", "vermont": "Northeast", "new hampshire": "Northeast",
  "new york": "Northeast",
  // Mid-Atlantic
  "pennsylvania": "Mid-Atlantic", "new jersey": "Mid-Atlantic", "delaware": "Mid-Atlantic",
  "maryland": "Mid-Atlantic", "virginia": "Mid-Atlantic", "west virginia": "Mid-Atlantic",
  "district of columbia": "Mid-Atlantic", "dc": "Mid-Atlantic", "washington dc": "Mid-Atlantic",
  "d.c.": "Mid-Atlantic",
  // South
  "north carolina": "South", "south carolina": "South", "georgia": "South",
  "florida": "South", "alabama": "South", "mississippi": "South", "louisiana": "South",
  "tennessee": "South", "kentucky": "South", "arkansas": "South",
  "texas": "South", "oklahoma": "South",
  // Midwest
  "ohio": "Midwest", "michigan": "Midwest", "indiana": "Midwest", "illinois": "Midwest",
  "wisconsin": "Midwest", "minnesota": "Midwest", "iowa": "Midwest", "missouri": "Midwest",
  "kansas": "Midwest", "nebraska": "Midwest", "south dakota": "Midwest",
  "north dakota": "Midwest",
  // West
  "california": "West", "oregon": "West", "washington": "West", "colorado": "West",
  "arizona": "West", "nevada": "West", "utah": "West", "new mexico": "West",
  "idaho": "West", "montana": "West", "wyoming": "West", "hawaii": "West", "alaska": "West",
};

// Known school → state mappings for schools GPT commonly misplaces
const SCHOOL_STATE_OVERRIDES: Record<string, string> = {
  "georgia tech": "georgia", "georgia institute of technology": "georgia",
  "emory": "georgia", "emory university": "georgia",
  "duke": "north carolina", "duke university": "north carolina",
  "vanderbilt": "tennessee", "vanderbilt university": "tennessee",
  "rice": "texas", "rice university": "texas",
  "tulane": "louisiana", "tulane university": "louisiana",
  "clemson": "south carolina", "clemson university": "south carolina",
  "virginia tech": "virginia", "virginia polytechnic": "virginia",
  "wake forest": "north carolina", "wake forest university": "north carolina",
  "johns hopkins": "maryland", "johns hopkins university": "maryland",
  "georgetown": "district of columbia", "georgetown university": "district of columbia",
  "carnegie mellon": "pennsylvania", "carnegie mellon university": "pennsylvania", "cmu": "pennsylvania",
  "mit": "massachusetts", "massachusetts institute of technology": "massachusetts",
  "caltech": "california", "california institute of technology": "california",
  "stanford": "california", "stanford university": "california",
  "northwestern": "illinois", "northwestern university": "illinois",
  "uchicago": "illinois", "university of chicago": "illinois",
  "notre dame": "indiana", "university of notre dame": "indiana",
  "purdue": "indiana", "purdue university": "indiana",
  "washu": "missouri", "wustl": "missouri", "washington university in st. louis": "missouri",
  "florida state": "florida", "florida state university": "florida",
  "ut austin": "texas", "university of texas at austin": "texas",
  "texas a&m": "texas", "texas a&m university": "texas",
};

/** Look up the correct region for a school name.
 *  Returns the corrected region or null if the school is unknown. */
export function getSchoolRegion(schoolName: string): RegionType | null {
  const lower = schoolName.toLowerCase().trim();

  // 1. Try explicit school → state override
  for (const [key, state] of Object.entries(SCHOOL_STATE_OVERRIDES)) {
    if (lower.includes(key)) {
      return STATE_TO_REGION[state] ?? null;
    }
  }

  // 2. Try to extract state from "University of <State>" pattern
  const uniOfMatch = lower.match(/university of (\w[\w\s]*)/);
  if (uniOfMatch) {
    const stateName = uniOfMatch[1].trim();
    if (STATE_TO_REGION[stateName]) return STATE_TO_REGION[stateName];
  }

  // 3. Try matching any state name within the school name
  for (const [state, region] of Object.entries(STATE_TO_REGION)) {
    if (state.length > 3 && lower.includes(state)) {
      return region;
    }
  }

  return null;
}

// Helper function to check if a school name matches any test-required school
export function isTestRequiredSchool(schoolName: string): boolean {
  const normalizedName = schoolName.toLowerCase().trim();
  return TEST_REQUIRED_SCHOOLS.some(
    (required) => normalizedName.includes(required.toLowerCase())
  );
}
