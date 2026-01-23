export type RegionType = "Northeast" | "Mid-Atlantic" | "South" | "Midwest" | "West";
export type CampusSizeType = "Micro" | "Small" | "Medium" | "Large" | "Mega";

export interface RigorScore {
  category: string;
  score: number;
  maxScore: number;
  description: string;
}

export interface RecommendedSchool {
  name: string;
  url: string;
  type: "reach" | "match" | "safety";
  region: RegionType;
  campusSize: CampusSizeType;
  enrollment: number;
  matchReasoning: string;
}

export interface GapAnalysisItem {
  subject: string;
  offered: string[];
  taken: string[];
  missed: string[];
}

export interface AnalysisResult {
  scorecard: {
    overallScore: number;
    maxScore: number;
    scores: RigorScore[];
  };
  narrative: string;
  schoolProfileSummary: string;
  transcriptSummary: string;
  recommendedSchools: RecommendedSchool[];
  gapAnalysis: GapAnalysisItem[];
}

export interface FilteredRecommendationsRequest {
  transcriptSummary: string;
  schoolProfileSummary: string;
  overallScore: number;
  regions: RegionType[];
  sizes: CampusSizeType[];
}
