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

function getGPAColor(gpa: number): string {
  if (gpa >= 3.7) return "text-teal";
  if (gpa >= 3.0) return "text-gold-dark";
  return "text-coral";
}

export function RigorScorecard({
  overallScore,
  maxScore,
  scores,
  schoolSummary,
  transcriptSummary,
  recalculatedGPA,
}: RigorScorecardProps) {
  const cappedOverallScore = Math.min(overallScore, maxScore);
  const overallPercentage = Math.min((cappedOverallScore / maxScore) * 100, 100);

  return (
    <div className="space-y-6">
      {/* Recalculated Core GPA Badge */}
      {recalculatedGPA != null && (
        <Card className="rounded-xl border border-teal/20 bg-teal/5 shadow-sm">
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
        <Card className="rounded-xl border-warmgray-200 shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              School Profile Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-charcoal">{schoolSummary}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-warmgray-200 shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Transcript Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-charcoal">{transcriptSummary}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
