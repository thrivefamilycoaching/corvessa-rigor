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
