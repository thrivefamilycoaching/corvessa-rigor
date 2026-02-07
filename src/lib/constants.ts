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

// Helper function to check if a school name matches any test-required school
export function isTestRequiredSchool(schoolName: string): boolean {
  const normalizedName = schoolName.toLowerCase().trim();
  return TEST_REQUIRED_SCHOOLS.some(
    (required) => normalizedName.includes(required.toLowerCase())
  );
}
