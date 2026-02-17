"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { RecommendedSchool } from "@/lib/types";
import { CAMPUS_SIZES, PROGRAM_FILTERS } from "@/lib/constants";
import {
  GitCompareArrows,
  TrendingUp,
  Target,
  Shield,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";

interface SchoolComparisonProps {
  schools: RecommendedSchool[];
}

function getTypeLabel(type: RecommendedSchool["type"]): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getSizeLabel(size: string): string {
  const sizeInfo = CAMPUS_SIZES.find((s) => s.value === size);
  return sizeInfo ? `${sizeInfo.label} (${sizeInfo.range})` : size;
}

function formatEnrollment(enrollment: number): string {
  if (enrollment >= 1000) {
    return `${(enrollment / 1000).toFixed(1)}K students`;
  }
  return `${enrollment} students`;
}

function formatOdds(probability: number | undefined): string {
  if (probability === undefined || probability === null) return "N/A";
  if (probability < 10) return "<10%";
  if (probability > 95) return "95%+";
  return `${probability}%`;
}

function TypeIcon({ type }: { type: RecommendedSchool["type"] }) {
  switch (type) {
    case "reach":
      return <TrendingUp className="h-3.5 w-3.5" />;
    case "match":
      return <Target className="h-3.5 w-3.5" />;
    case "safety":
      return <Shield className="h-3.5 w-3.5" />;
  }
}

const typeBadgeClasses: Record<RecommendedSchool["type"], string> = {
  reach: "bg-coral text-white",
  match: "bg-teal text-white",
  safety: "bg-safegreen text-white",
};

const typeGroupColors: Record<RecommendedSchool["type"], { border: string; text: string; icon: string }> = {
  safety: { border: "border-safegreen", text: "text-safegreen-dark", icon: "text-safegreen-dark" },
  match: { border: "border-teal", text: "text-teal", icon: "text-teal" },
  reach: { border: "border-coral", text: "text-coral", icon: "text-coral" },
};

const typeGroupIcons: Record<RecommendedSchool["type"], React.ReactNode> = {
  safety: <Shield className="h-4 w-4" />,
  match: <Target className="h-4 w-4" />,
  reach: <TrendingUp className="h-4 w-4" />,
};

export function SchoolComparison({ schools }: SchoolComparisonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [showTable, setShowTable] = useState(false);

  const safetySchools = schools
    .map((s, i) => ({ school: s, index: i }))
    .filter(({ school }) => school.type === "safety");
  const matchSchools = schools
    .map((s, i) => ({ school: s, index: i }))
    .filter(({ school }) => school.type === "match");
  const reachSchools = schools
    .map((s, i) => ({ school: s, index: i }))
    .filter(({ school }) => school.type === "reach");

  const toggleSchool = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < 4) {
        next.add(index);
      }
      return next;
    });
  };

  const handleCompare = () => {
    setShowTable(true);
  };

  const handleReset = () => {
    setShowTable(false);
    setSelectedIndices(new Set());
  };

  const selectedSchools = schools.filter((_, i) => selectedIndices.has(i));

  // Comparison rows definition
  const rows: { label: string; render: (school: RecommendedSchool) => React.ReactNode }[] = [
    {
      label: "School",
      render: (school) => (
        <a
          href={school.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-charcoal hover:text-teal hover:underline transition-colors"
        >
          {school.name}
        </a>
      ),
    },
    {
      label: "Category",
      render: (school) => (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${typeBadgeClasses[school.type]}`}>
          <TypeIcon type={school.type} />
          {getTypeLabel(school.type)}
        </span>
      ),
    },
    {
      label: "Admission Odds",
      render: (school) => (
        <span className={`text-sm font-medium ${
          school.acceptanceProbability !== undefined
            ? school.acceptanceProbability < 30
              ? "text-coral"
              : school.acceptanceProbability > 65
                ? "text-safegreen-dark"
                : "text-teal"
            : "text-gray-400"
        }`}>
          {formatOdds(school.acceptanceProbability)}
        </span>
      ),
    },
    {
      label: "Region",
      render: (school) => <span className="text-sm text-gray-700">{school.region}</span>,
    },
    {
      label: "Campus Size",
      render: (school) => <span className="text-sm text-gray-700">{getSizeLabel(school.campusSize)}</span>,
    },
    {
      label: "Enrollment",
      render: (school) => <span className="text-sm text-gray-700">{formatEnrollment(school.enrollment)}</span>,
    },
    {
      label: "Test Policy",
      render: (school) => {
        if (!school.testPolicy) return <span className="text-sm text-gray-400">N/A</span>;
        const colorClass =
          school.testPolicy === "Test Optional" ? "border-green-300 text-green-800 bg-green-100" :
          school.testPolicy === "Test Required" ? "border-red-300 text-red-800 bg-red-100" :
          "border-blue-300 text-blue-800 bg-blue-100";
        return (
          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${colorClass}`}>
            {school.testPolicy}
          </span>
        );
      },
    },
    {
      label: "Programs",
      render: (school) => {
        if (!school.programs) return <span className="text-sm text-gray-400">N/A</span>;
        const active = PROGRAM_FILTERS.filter((p) => school.programs?.[p.key]);
        if (active.length === 0) return <span className="text-sm text-gray-400">None listed</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {active.map((p) => (
              <span key={p.key} className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-warmgray-100 text-charcoal border border-warmgray-200">
                {p.label}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      label: "NCAA Division",
      render: (school) => {
        if (!school.programs?.ncaaDivision || school.programs.ncaaDivision === "None") {
          return <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-warmgray-100 text-muted-foreground border border-warmgray-200">No NCAA</span>;
        }
        return (
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            NCAA {school.programs.ncaaDivision}
          </span>
        );
      },
    },
    {
      label: "Match Reasoning",
      render: (school) => <p className="text-sm text-gray-600 leading-relaxed">{school.matchReasoning}</p>,
    },
  ];

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        className="border-teal text-teal hover:bg-teal hover:text-white"
      >
        <GitCompareArrows className="mr-2 h-4 w-4" />
        Compare Schools
      </Button>
    );
  }

  return (
    <div className="w-full">
      {/* Toggle button in open state */}
      <Button
        onClick={() => {
          setIsOpen(false);
          setShowTable(false);
          setSelectedIndices(new Set());
        }}
        variant="outline"
        className="border-teal text-teal hover:bg-teal hover:text-white mb-4"
      >
        <GitCompareArrows className="mr-2 h-4 w-4" />
        Compare Schools
        <ChevronUp className="ml-2 h-4 w-4" />
      </Button>

      <Card className="rounded-xl border-warmgray-200 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg text-charcoal flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5 text-teal" />
            {showTable ? "School Comparison" : "Select Schools to Compare"}
          </CardTitle>
          {!showTable && (
            <p className="text-sm text-muted-foreground">
              Choose 2-4 schools to compare side by side. {selectedIndices.size}/4 selected.
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {!showTable ? (
            <>
              {/* School selection checkboxes grouped by type */}
              {[
                { type: "safety" as const, items: safetySchools, label: "Safety Schools" },
                { type: "match" as const, items: matchSchools, label: "Match Schools" },
                { type: "reach" as const, items: reachSchools, label: "Reach Schools" },
              ].map(
                ({ type, items, label }) =>
                  items.length > 0 && (
                    <div key={type}>
                      <h4 className={`text-sm font-semibold ${typeGroupColors[type].text} mb-2 flex items-center gap-2 border-l-4 ${typeGroupColors[type].border} pl-3`}>
                        <span className={typeGroupColors[type].icon}>{typeGroupIcons[type]}</span>
                        {label} ({items.length})
                      </h4>
                      <div className="space-y-2 pl-5">
                        {items.map(({ school, index }) => (
                          <label
                            key={index}
                            className="flex items-center gap-3 cursor-pointer group"
                          >
                            <Checkbox
                              checked={selectedIndices.has(index)}
                              onCheckedChange={() => toggleSchool(index)}
                              disabled={!selectedIndices.has(index) && selectedIndices.size >= 4}
                            />
                            <span className="text-sm text-charcoal group-hover:text-teal transition-colors">
                              {school.name}
                            </span>
                            {school.acceptanceProbability !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                ({formatOdds(school.acceptanceProbability)})
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
              )}

              {/* Compare button */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleCompare}
                  disabled={selectedIndices.size < 2}
                  className="bg-teal hover:bg-teal-dark text-white"
                >
                  <GitCompareArrows className="mr-2 h-4 w-4" />
                  Compare {selectedIndices.size > 0 ? `(${selectedIndices.size})` : ""}
                </Button>
                {selectedIndices.size > 0 && selectedIndices.size < 2 && (
                  <span className="text-xs text-muted-foreground">Select at least 2 schools</span>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Back / reset button */}
              <div className="flex items-center gap-3 mb-2">
                <Button
                  onClick={handleReset}
                  variant="outline"
                  size="sm"
                  className="border-teal text-teal hover:bg-teal hover:text-white"
                >
                  <ChevronDown className="mr-1 h-3 w-3 rotate-90" />
                  Change Selection
                </Button>
                <span className="text-sm text-muted-foreground">
                  Comparing {selectedSchools.length} schools
                </span>
              </div>

              {/* Desktop: comparison table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider p-3 w-36">
                        &nbsp;
                      </th>
                      {selectedSchools.map((school, i) => (
                        <th key={i} className="text-left p-3 min-w-[180px]">
                          <span className="text-sm font-semibold text-charcoal">{school.name}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 0 ? "bg-warmgray-50" : "bg-white"}>
                        <td className="text-xs font-semibold text-muted-foreground uppercase tracking-wider p-3 align-top whitespace-nowrap">
                          {row.label}
                        </td>
                        {selectedSchools.map((school, ci) => (
                          <td key={ci} className="p-3 align-top">
                            {row.render(school)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: stacked cards */}
              <div className="md:hidden space-y-4">
                {selectedSchools.map((school, i) => {
                  const borderColor =
                    school.type === "reach" ? "border-l-coral" :
                    school.type === "match" ? "border-l-teal" :
                    "border-l-safegreen";

                  return (
                    <div
                      key={i}
                      className={`rounded-xl border border-warmgray-200 bg-white p-4 border-l-4 ${borderColor}`}
                    >
                      {rows.map((row, ri) => (
                        <div
                          key={ri}
                          className={`${ri > 0 ? "mt-3 pt-3 border-t border-warmgray-100" : ""}`}
                        >
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                            {row.label}
                          </div>
                          <div>{row.render(school)}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
