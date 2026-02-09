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
  recalculatedGPA?: number;
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

function getGPAColor(gpa: number): string {
  if (gpa >= 3.7) return "text-green-600 dark:text-green-400";
  if (gpa >= 3.0) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function RigorScorecard({
  overallScore,
  maxScore,
  scores,
  schoolSummary,
  transcriptSummary,
  recalculatedGPA,
}: RigorScorecardProps) {
  // Cap overall score at maxScore to prevent overflow
  const cappedOverallScore = Math.min(overallScore, maxScore);
  const overallPercentage = Math.min((cappedOverallScore / maxScore) * 100, 100);
  const badge = getScoreBadge(overallPercentage);

  return (
    <div className="space-y-6">
      {/* Recalculated Core GPA Badge */}
      {recalculatedGPA != null && (
        <Card className="border-2 border-primary/30 bg-primary/5">
          <CardContent className="py-6">
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Recalculated Core GPA
                </p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className={`text-5xl font-bold ${getGPAColor(recalculatedGPA)}`}>
                    {recalculatedGPA.toFixed(2)}
                  </span>
                  <span className="text-lg text-muted-foreground">/ 4.0</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Weighted — Academic Core Only (Math, Science, English, Social Studies, World Languages)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
