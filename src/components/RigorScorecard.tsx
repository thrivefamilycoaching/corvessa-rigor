"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { RigorScore } from "@/lib/types";

interface RigorScorecardProps {
  overallScore: number;
  maxScore: number;
  scores: RigorScore[];
  schoolSummary: string;
  transcriptSummary: string;
}

function getScoreColor(percentage: number): string {
  if (percentage >= 80) return "text-green-600 dark:text-green-400";
  if (percentage >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreBadge(percentage: number): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (percentage >= 90) return { label: "Exceptional", variant: "default" };
  if (percentage >= 80) return { label: "Strong", variant: "default" };
  if (percentage >= 70) return { label: "Good", variant: "secondary" };
  if (percentage >= 60) return { label: "Moderate", variant: "secondary" };
  return { label: "Needs Improvement", variant: "destructive" };
}

export function RigorScorecard({
  overallScore,
  maxScore,
  scores,
  schoolSummary,
  transcriptSummary,
}: RigorScorecardProps) {
  // Cap overall score at maxScore to prevent overflow
  const cappedOverallScore = Math.min(overallScore, maxScore);
  const overallPercentage = Math.min((cappedOverallScore / maxScore) * 100, 100);
  const badge = getScoreBadge(overallPercentage);

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Rigor Scorecard</CardTitle>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-center gap-2 mb-4">
            <span className={`text-6xl font-bold ${getScoreColor(overallPercentage)}`}>
              {cappedOverallScore}
            </span>
            <span className="text-2xl text-muted-foreground mb-2">/ {maxScore}</span>
          </div>
          <Progress value={overallPercentage} className="h-3" />
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scores.map((score, index) => {
            // Cap score at maxScore to prevent overflow
            const cappedScore = Math.min(score.score, score.maxScore);
            const percentage = Math.min((cappedScore / score.maxScore) * 100, 100);
            return (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{score.category}</span>
                  <span className={`text-sm font-semibold ${getScoreColor(percentage)}`}>
                    {cappedScore}/{score.maxScore}
                  </span>
                </div>
                <Progress value={percentage} className="h-2" />
                <p className="text-xs text-muted-foreground">{score.description}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Document Summaries */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              School Profile Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{schoolSummary}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Transcript Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{transcriptSummary}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
