import type { RegionType, CampusSizeType, TestPolicyType } from "./types";

export const REGIONS: RegionType[] = ["Northeast", "Mid-Atlantic", "South", "Midwest", "West"];

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

// Hard-coded list of schools with STRICT Test Required policies
// These override any GPT-generated policy data
export const TEST_REQUIRED_SCHOOLS: string[] = [
  "Georgetown",
  "Georgetown University",
  "MIT",
  "Massachusetts Institute of Technology",
  "Georgia Tech",
  "Georgia Institute of Technology",
  "Caltech",
  "California Institute of Technology",
  "Harvard",
  "Harvard University",
  "Stanford",
  "Stanford University",
  "Purdue",
  "Purdue University",
  "UT Austin",
  "University of Texas at Austin",
  "University of Texas",
  "Florida",
  "University of Florida",
  "Tennessee",
  "University of Tennessee",
  "Yale",
  "Yale University",
  "Princeton",
  "Princeton University",
  "Columbia",
  "Columbia University",
  "Penn",
  "University of Pennsylvania",
  "Brown",
  "Brown University",
  "Dartmouth",
  "Dartmouth College",
  "Cornell",
  "Cornell University",
];

// Helper function to check if a school name matches any test-required school
export function isTestRequiredSchool(schoolName: string): boolean {
  const normalizedName = schoolName.toLowerCase().trim();
  return TEST_REQUIRED_SCHOOLS.some(
    (required) => normalizedName.includes(required.toLowerCase())
  );
}
