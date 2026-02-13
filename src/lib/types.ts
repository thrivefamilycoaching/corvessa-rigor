export type RegionType = "Northeast" | "Mid-Atlantic" | "South" | "Midwest" | "West";
export type CampusSizeType = "Micro" | "Small" | "Medium" | "Large" | "Mega";
export type TestPolicyType = "Test Optional" | "Test Required" | "Test Blind";

export interface RigorScore {
  category: string;
  score: number;
  maxScore: number;
  description: string;
}

export type NCAAdivision = "DI" | "DII" | "DIII" | "None";

export interface SchoolPrograms {
  greekLife?: boolean;
  rotc?: boolean;
  studyAbroad?: boolean;
  honorsCollege?: boolean;
  coopInternship?: boolean;
  preMed?: boolean;
  preLaw?: boolean;
  engineering?: boolean;
  nursing?: boolean;
  businessSchool?: boolean;
  performingArts?: boolean;
  ncaaDivision: NCAAdivision;
}

export interface RecommendedSchool {
  name: string;
  url: string;
  type: "reach" | "match" | "safety";
  region: RegionType;
  campusSize: CampusSizeType;
  enrollment: number;
  matchReasoning: string;
  testPolicy?: TestPolicyType;
  acceptanceProbability?: number;
  programs?: SchoolPrograms;
  state?: string;
}

export interface GapAnalysisItem {
  subject: string;
  offered: string[];
  taken: string[];
  missed: string[];
}

export interface ActivitiesAnalysis {
  categories: {
    name: string;
    activities: string[];
  }[];
  leadershipScore: number;
  summary: string;
}

export interface AnalysisResult {
  scorecard: {
    overallScore: number;
    maxScore: number;
    scores: RigorScore[];
  };
  recalculatedGPA: number;
  narrative: string;
  schoolProfileSummary: string;
  transcriptSummary: string;
  recommendedSchools: RecommendedSchool[];
  gapAnalysis: GapAnalysisItem[];
  activitiesAnalysis?: ActivitiesAnalysis;
}

export interface TestScores {
  satReading?: number;
  satMath?: number;
  actComposite?: number;
}

export interface FilteredRecommendationsRequest {
  transcriptSummary: string;
  schoolProfileSummary: string;
  overallScore: number;
  recalculatedGPA?: number;
  regions: RegionType[];
  sizes: CampusSizeType[];
  policies: TestPolicyType[];
  testScores?: TestScores;
}
