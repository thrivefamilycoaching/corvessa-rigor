"use client";

import { Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ActivitiesAnalysis } from "@/lib/types";

interface ActivitiesProfileProps {
  analysis: ActivitiesAnalysis;
}

export function ActivitiesProfile({ analysis }: ActivitiesProfileProps) {
  const { categories, leadershipScore, summary } = analysis;

  const scoreBadgeClass =
    leadershipScore >= 7
      ? "bg-teal text-white"
      : leadershipScore >= 4
        ? "bg-gold text-charcoal"
        : "bg-warmgray-200 text-charcoal";

  return (
    <Card className="rounded-xl border-warmgray-200 shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="pt-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-teal" />
            <h3 className="text-lg font-semibold text-charcoal">
              Activities & Leadership Profile
            </h3>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${scoreBadgeClass}`}
          >
            Leadership: {leadershipScore}/10
          </span>
        </div>

        {summary && (
          <p className="mb-4 text-sm text-muted-foreground">{summary}</p>
        )}

        {categories.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <div
                key={cat.name}
                className="rounded-lg border border-warmgray-200 bg-warmgray-50 p-3"
              >
                <h4 className="mb-2 text-sm font-semibold text-teal">{cat.name}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {cat.activities.map((activity) => (
                    <span
                      key={activity}
                      className="inline-block rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-medium text-teal"
                    >
                      {activity}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
