"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GapAnalysisItem } from "@/lib/types";
import { BarChart3, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface GapAnalysisProps {
  gapAnalysis: GapAnalysisItem[];
}

export function GapAnalysis({ gapAnalysis }: GapAnalysisProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          <CardTitle>Curriculum Gap Analysis</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Comparison of school offerings vs. student course selections
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 px-4 text-left font-medium">Subject</th>
                <th className="py-3 px-4 text-left font-medium">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                    Offered
                  </span>
                </th>
                <th className="py-3 px-4 text-left font-medium">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Taken
                  </span>
                </th>
                <th className="py-3 px-4 text-left font-medium">
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-amber-500" />
                    Missed Opportunities
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {gapAnalysis.map((item, index) => (
                <tr key={index} className="border-b last:border-0">
                  <td className="py-4 px-4 font-medium align-top">{item.subject}</td>
                  <td className="py-4 px-4 align-top">
                    <div className="flex flex-wrap gap-1">
                      {item.offered.length > 0 ? (
                        item.offered.map((course, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {course}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">None listed</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 align-top">
                    <div className="flex flex-wrap gap-1">
                      {item.taken.length > 0 ? (
                        item.taken.map((course, i) => (
                          <Badge key={i} variant="default" className="text-xs bg-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {course}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs flex items-center gap-1">
                          <XCircle className="h-3 w-3" />
                          None taken
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 align-top">
                    <div className="flex flex-wrap gap-1">
                      {item.missed.length > 0 ? (
                        item.missed.map((course, i) => (
                          <Badge key={i} variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            {course}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-green-600 text-xs flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          All rigorous options taken
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <SummaryCard
            label="Total Offered"
            value={gapAnalysis.reduce((sum, item) => sum + item.offered.length, 0)}
            icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          />
          <SummaryCard
            label="Courses Taken"
            value={gapAnalysis.reduce((sum, item) => sum + item.taken.length, 0)}
            icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          />
          <SummaryCard
            label="Opportunities Missed"
            value={gapAnalysis.reduce((sum, item) => sum + item.missed.length, 0)}
            icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4 text-center">
      <div className="flex items-center justify-center gap-2 mb-1">
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
