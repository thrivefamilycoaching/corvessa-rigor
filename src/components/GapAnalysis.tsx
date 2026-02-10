"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GapAnalysisItem } from "@/lib/types";
import { BarChart3, CheckCircle2, XCircle, AlertCircle, Pencil, Plus } from "lucide-react";

interface GapOverrides {
  [subject: string]: {
    taken: string[];
    missed: string[];
  };
}

interface GapAnalysisProps {
  gapAnalysis: GapAnalysisItem[];
}

export function GapAnalysis({ gapAnalysis }: GapAnalysisProps) {
  const [overrides, setOverrides] = useState<GapOverrides>({});
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editTaken, setEditTaken] = useState<string[]>([]);
  const [editMissed, setEditMissed] = useState<string[]>([]);
  const [newMissedInput, setNewMissedInput] = useState("");

  const getEffectiveItem = (item: GapAnalysisItem): GapAnalysisItem => {
    const override = overrides[item.subject];
    if (!override) return item;
    return { ...item, taken: override.taken, missed: override.missed };
  };

  const startEditing = (item: GapAnalysisItem) => {
    const effective = getEffectiveItem(item);
    setEditTaken(effective.taken.length > 0 ? [...effective.taken] : [""]);
    setEditMissed([...effective.missed]);
    setNewMissedInput("");
    setEditingSubject(item.subject);
  };

  const saveEditing = (subject: string) => {
    setOverrides((prev) => ({
      ...prev,
      [subject]: {
        taken: editTaken.filter((t) => t.trim() !== ""),
        missed: [...editMissed],
      },
    }));
    setEditingSubject(null);
  };

  const cancelEditing = () => {
    setEditingSubject(null);
  };

  const toggleMissedItem = (course: string) => {
    setEditMissed((prev) =>
      prev.includes(course) ? prev.filter((c) => c !== course) : [...prev, course]
    );
  };

  const addCustomMissed = () => {
    const trimmed = newMissedInput.trim();
    if (trimmed && !editMissed.includes(trimmed)) {
      setEditMissed((prev) => [...prev, trimmed]);
      setNewMissedInput("");
    }
  };

  const effectiveData = gapAnalysis.map(getEffectiveItem);

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
              {gapAnalysis.map((originalItem, index) => {
                const item = getEffectiveItem(originalItem);
                const isEditing = editingSubject === item.subject;
                const hasOverride = !!overrides[item.subject];
                const allMissedOptions = [
                  ...new Set([...originalItem.missed, ...(overrides[item.subject]?.missed || [])]),
                ];

                return (
                  <tr key={index} className="border-b last:border-0">
                    <td className="py-4 px-4 font-medium align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.subject}
                        {hasOverride && (
                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                            Manual override
                          </span>
                        )}
                      </div>
                    </td>
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
                      {isEditing ? (
                        <div className="space-y-2">
                          {editTaken.map((course, i) => (
                            <input
                              key={i}
                              type="text"
                              value={course}
                              onChange={(e) => {
                                const updated = [...editTaken];
                                updated[i] = e.target.value;
                                setEditTaken(updated);
                              }}
                              placeholder="Enter course taken..."
                              className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          ))}
                        </div>
                      ) : (
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
                      )}
                    </td>
                    <td className="py-4 px-4 align-top">
                      {isEditing ? (
                        <div className="space-y-2">
                          {allMissedOptions.map((course, i) => (
                            <label key={i} className="flex items-center gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editMissed.includes(course)}
                                onChange={() => toggleMissedItem(course)}
                                className="rounded border-gray-300"
                              />
                              <span>{course}</span>
                            </label>
                          ))}
                          {editMissed
                            .filter((c) => !allMissedOptions.includes(c))
                            .map((course, i) => (
                              <label key={`custom-${i}`} className="flex items-center gap-2 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={true}
                                  onChange={() => toggleMissedItem(course)}
                                  className="rounded border-gray-300"
                                />
                                <span>{course}</span>
                                <span className="text-purple-600 text-[10px]">(custom)</span>
                              </label>
                            ))}
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="Add missed course..."
                              value={newMissedInput}
                              onChange={(e) => setNewMissedInput(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && addCustomMissed()}
                              className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={addCustomMissed}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={() => saveEditing(item.subject)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={cancelEditing}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1 items-start">
                          <div className="flex flex-wrap gap-1 flex-1">
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
                            onClick={() => startEditing(originalItem)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <SummaryCard
            label="Total Offered"
            value={effectiveData.reduce((sum, item) => sum + item.offered.length, 0)}
            icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          />
          <SummaryCard
            label="Courses Taken"
            value={effectiveData.reduce((sum, item) => sum + item.taken.length, 0)}
            icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          />
          <SummaryCard
            label="Opportunities Missed"
            value={effectiveData.reduce((sum, item) => sum + item.missed.length, 0)}
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
