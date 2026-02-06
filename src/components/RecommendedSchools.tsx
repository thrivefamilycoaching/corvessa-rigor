"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { RecommendedSchool, RegionType, CampusSizeType, TestPolicyType, TestScores } from "@/lib/types";
import { REGIONS, CAMPUS_SIZES, TEST_POLICIES, isTestRequiredSchool } from "@/lib/constants";
import { getFilteredRecommendations } from "@/app/actions/analyze";
import {
  GraduationCap,
  TrendingUp,
  Target,
  Shield,
  MapPin,
  Users,
  Loader2,
  X,
  SlidersHorizontal,
  FileCheck,
} from "lucide-react";

interface RecommendedSchoolsProps {
  schools: RecommendedSchool[];
  transcriptSummary: string;
  schoolProfileSummary: string;
  overallScore: number;
  recalculatedGPA?: number;
  testScores?: TestScores;
}

function getTypeIcon(type: RecommendedSchool["type"]) {
  switch (type) {
    case "reach":
      return <TrendingUp className="h-4 w-4" />;
    case "match":
      return <Target className="h-4 w-4" />;
    case "safety":
      return <Shield className="h-4 w-4" />;
  }
}

function getTypeBadgeVariant(
  type: RecommendedSchool["type"]
): "default" | "secondary" | "destructive" {
  switch (type) {
    case "reach":
      return "destructive";
    case "match":
      return "default";
    case "safety":
      return "secondary";
  }
}

function getTypeLabel(type: RecommendedSchool["type"]): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getSizeLabel(size: CampusSizeType): string {
  const sizeInfo = CAMPUS_SIZES.find((s) => s.value === size);
  return sizeInfo ? `${sizeInfo.label} (${sizeInfo.range})` : size;
}

function formatEnrollment(enrollment: number): string {
  if (enrollment >= 1000) {
    return `${(enrollment / 1000).toFixed(1)}K students`;
  }
  return `${enrollment} students`;
}

/**
 * STRICT: Odds dictate category. No school is ever promoted to a higher
 * category than its odds allow. Backfill can only demote, never promote.
 *
 *   Reach:  odds < 25%
 *   Match:  odds 25–60%
 *   Safety: odds > 60%
 *
 * Schools are grouped by their odds-based category, then sorted within
 * each group. No 3/4/3 forcing — the numbers are what the numbers are.
 */
function balanceSchools(schools: RecommendedSchool[]): RecommendedSchool[] {
  // STRICT re-categorize: odds alone decide category, no overrides
  const categorized = schools.map((s) => {
    const prob = Math.max(1, Math.min(95, s.acceptanceProbability ?? 50));
    let type: "reach" | "match" | "safety";
    if (prob > 60) type = "safety";
    else if (prob >= 25) type = "match";
    else type = "reach";
    return { ...s, type, acceptanceProbability: prob };
  });

  const reach = categorized
    .filter((s) => s.type === "reach")
    .sort((a, b) => (a.acceptanceProbability ?? 0) - (b.acceptanceProbability ?? 0));
  const match = categorized
    .filter((s) => s.type === "match")
    .sort((a, b) => (b.acceptanceProbability ?? 0) - (a.acceptanceProbability ?? 0));
  const safety = categorized
    .filter((s) => s.type === "safety")
    .sort((a, b) => (b.acceptanceProbability ?? 0) - (a.acceptanceProbability ?? 0));

  return [...reach, ...match, ...safety];
}

export function RecommendedSchools({
  schools: initialSchools,
  transcriptSummary,
  schoolProfileSummary,
  overallScore,
  recalculatedGPA,
  testScores,
}: RecommendedSchoolsProps) {
  const [schools, setSchools] = useState<RecommendedSchool[]>(() => balanceSchools(initialSchools));
  const [selectedRegions, setSelectedRegions] = useState<RegionType[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<CampusSizeType[]>([]);
  const [selectedPolicies, setSelectedPolicies] = useState<TestPolicyType[]>([]);
  const [pendingRegions, setPendingRegions] = useState<RegionType[]>([]);
  const [pendingSizes, setPendingSizes] = useState<CampusSizeType[]>([]);
  const [pendingPolicies, setPendingPolicies] = useState<TestPolicyType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filtersApplied, setFiltersApplied] = useState(false);

  const toggleRegion = (region: RegionType) => {
    setPendingRegions((prev) =>
      prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]
    );
  };

  const toggleSize = (size: CampusSizeType) => {
    setPendingSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const togglePolicy = (policy: TestPolicyType) => {
    setPendingPolicies((prev) =>
      prev.includes(policy) ? prev.filter((p) => p !== policy) : [...prev, policy]
    );
  };

  const removeRegionChip = (region: RegionType) => {
    const newRegions = selectedRegions.filter((r) => r !== region);
    setSelectedRegions(newRegions);
    setPendingRegions(newRegions);
    // Re-filter with updated selections
    applyFiltersWithValues(newRegions, selectedSizes, selectedPolicies);
  };

  const removeSizeChip = (size: CampusSizeType) => {
    const newSizes = selectedSizes.filter((s) => s !== size);
    setSelectedSizes(newSizes);
    setPendingSizes(newSizes);
    // Re-filter with updated selections
    applyFiltersWithValues(selectedRegions, newSizes, selectedPolicies);
  };

  const removePolicyChip = (policy: TestPolicyType) => {
    const newPolicies = selectedPolicies.filter((p) => p !== policy);
    setSelectedPolicies(newPolicies);
    setPendingPolicies(newPolicies);
    // Re-filter with updated selections
    applyFiltersWithValues(selectedRegions, selectedSizes, newPolicies);
  };

  const clearAllFilters = () => {
    setSelectedRegions([]);
    setSelectedSizes([]);
    setSelectedPolicies([]);
    setPendingRegions([]);
    setPendingSizes([]);
    setPendingPolicies([]);
    setSchools(balanceSchools(initialSchools));
    setFiltersApplied(false);
  };

  const applyFiltersWithValues = async (regions: RegionType[], sizes: CampusSizeType[], policies: TestPolicyType[]) => {
    // If no filters selected, show original results
    if (regions.length === 0 && sizes.length === 0 && policies.length === 0) {
      setSchools(balanceSchools(initialSchools));
      setFiltersApplied(false);
      return;
    }

    // Try to filter existing schools first
    // Logic: OR within each filter group, AND between groups
    // - Regions: show if school matches ANY selected region
    // - Sizes: show if school matches ANY selected size
    // - Policies: show if school matches ANY selected policy
    const filteredExisting = initialSchools.filter((school) => {
      const regionMatch = regions.length === 0 || regions.includes(school.region);
      const sizeMatch = sizes.length === 0 || sizes.includes(school.campusSize);
      // Use hard-coded override for known Test Required schools
      // Otherwise use GPT-provided policy, defaulting to "Test Optional"
      const schoolPolicy: TestPolicyType = isTestRequiredSchool(school.name)
        ? "Test Required"
        : (school.testPolicy || "Test Optional");
      const policyMatch = policies.length === 0 || policies.includes(schoolPolicy);
      return regionMatch && sizeMatch && policyMatch;
    });

    // If we have enough matching schools, balance and use them
    if (filteredExisting.length >= 10) {
      setSchools(balanceSchools(filteredExisting));
      setFiltersApplied(true);
      return;
    }

    // If we have some matches but fewer than 10, backfill from initial schools
    // by adding the highest-probability non-duplicate schools
    if (filteredExisting.length >= 5) {
      const filteredNames = new Set(filteredExisting.map((s) => s.name));
      const backfillCandidates = initialSchools
        .filter((s) => !filteredNames.has(s.name))
        .sort((a, b) => (b.acceptanceProbability ?? 0) - (a.acceptanceProbability ?? 0));
      const backfilled = [...filteredExisting, ...backfillCandidates.slice(0, 10 - filteredExisting.length)];
      setSchools(balanceSchools(backfilled));
      setFiltersApplied(true);
      return;
    }

    // Too few matches — fetch new recommendations from GPT-4o
    setIsLoading(true);
    try {
      const newSchools = await getFilteredRecommendations({
        transcriptSummary,
        schoolProfileSummary,
        overallScore,
        recalculatedGPA,
        regions,
        sizes,
        policies,
        testScores,
      });
      setSchools(balanceSchools(newSchools));
      setFiltersApplied(true);
    } catch (error) {
      console.error("Failed to fetch filtered recommendations:", error);
      // Backfill from initial schools if GPT call fails
      const filteredNames = new Set(filteredExisting.map((s) => s.name));
      const backfillCandidates = initialSchools
        .filter((s) => !filteredNames.has(s.name))
        .sort((a, b) => (b.acceptanceProbability ?? 0) - (a.acceptanceProbability ?? 0));
      const backfilled = [...filteredExisting, ...backfillCandidates.slice(0, 10 - filteredExisting.length)];
      setSchools(balanceSchools(backfilled));
      setFiltersApplied(true);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    setSelectedRegions(pendingRegions);
    setSelectedSizes(pendingSizes);
    setSelectedPolicies(pendingPolicies);
    applyFiltersWithValues(pendingRegions, pendingSizes, pendingPolicies);
  };

  const hasFilterChanges =
    JSON.stringify(pendingRegions.sort()) !== JSON.stringify(selectedRegions.sort()) ||
    JSON.stringify(pendingSizes.sort()) !== JSON.stringify(selectedSizes.sort()) ||
    JSON.stringify(pendingPolicies.sort()) !== JSON.stringify(selectedPolicies.sort());

  const reachSchools = schools.filter((s) => s.type === "reach");
  const matchSchools = schools.filter((s) => s.type === "match");
  const safetySchools = schools.filter((s) => s.type === "safety");

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              <CardTitle>Recommended Schools</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              National search based on course rigor and academic alignment
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="h-4 w-4" />
            Filter Recommendations
          </div>

          {/* Region Checkboxes */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Region (select multiple)
            </p>
            <div className="flex flex-wrap gap-3">
              {REGIONS.map((region) => (
                <label
                  key={region}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={pendingRegions.includes(region)}
                    onCheckedChange={() => toggleRegion(region)}
                  />
                  <span className="text-sm">{region}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Size Checkboxes */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Campus Size (select multiple)
            </p>
            <div className="flex flex-wrap gap-3">
              {CAMPUS_SIZES.map((size) => (
                <label
                  key={size.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={pendingSizes.includes(size.value)}
                    onCheckedChange={() => toggleSize(size.value)}
                  />
                  <span className="text-sm">
                    {size.label}{" "}
                    <span className="text-muted-foreground">({size.range})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Test Policy Checkboxes */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Testing Policy (select any that apply)
            </p>
            <div className="flex flex-wrap gap-3">
              {TEST_POLICIES.map((policy) => (
                <label
                  key={policy.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={pendingPolicies.includes(policy.value)}
                    onCheckedChange={() => togglePolicy(policy.value)}
                  />
                  <span className="text-sm">{policy.label}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-1.5">
              Selecting multiple shows schools matching any selected policy
            </p>
          </div>

          {/* Apply Button */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={applyFilters}
              disabled={isLoading || !hasFilterChanges}
              size="sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                "Apply Filters"
              )}
            </Button>
            {(selectedRegions.length > 0 || selectedSizes.length > 0 || selectedPolicies.length > 0) && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                Clear All
              </Button>
            )}
            {hasFilterChanges && !isLoading && (
              <span className="text-xs text-muted-foreground">
                Click Apply to update results
              </span>
            )}
          </div>
        </div>

        {/* Active Filter Chips */}
        {(selectedRegions.length > 0 || selectedSizes.length > 0 || selectedPolicies.length > 0) && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center mr-1">
              Active:
            </span>
            {selectedRegions.map((region) => (
              <Badge
                key={region}
                variant="secondary"
                className="pl-2 pr-1 gap-1 cursor-pointer hover:bg-secondary/80"
                onClick={() => removeRegionChip(region)}
              >
                <MapPin className="h-3 w-3" />
                {region}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
            {selectedSizes.map((size) => {
              const sizeInfo = CAMPUS_SIZES.find((s) => s.value === size);
              return (
                <Badge
                  key={size}
                  variant="secondary"
                  className="pl-2 pr-1 gap-1 cursor-pointer hover:bg-secondary/80"
                  onClick={() => removeSizeChip(size)}
                >
                  <Users className="h-3 w-3" />
                  {sizeInfo?.label} ({sizeInfo?.range})
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              );
            })}
            {selectedPolicies.map((policy) => (
              <Badge
                key={policy}
                variant="secondary"
                className="pl-2 pr-1 gap-1 cursor-pointer hover:bg-secondary/80"
                onClick={() => removePolicyChip(policy)}
              >
                <FileCheck className="h-3 w-3" />
                {policy}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}

        {/* Results Summary */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{schools.length} schools</span>
          <span className="text-muted-foreground/60">
            ({reachSchools.length} reach, {matchSchools.length} match, {safetySchools.length} safety)
          </span>
          {filtersApplied && <span>— filtered</span>}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Searching for schools matching your criteria...
            </p>
          </div>
        ) : schools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GraduationCap className="h-8 w-8 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              No schools match the selected filters. Try adjusting your criteria.
            </p>
          </div>
        ) : (
          <>
            {/* Reach Schools */}
            {reachSchools.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-red-500" />
                  Reach Schools ({reachSchools.length})
                </h4>
                <div className="space-y-3">
                  {reachSchools.map((school, index) => (
                    <SchoolCard key={index} school={school} />
                  ))}
                </div>
              </div>
            )}

            {/* Match Schools */}
            {matchSchools.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Match Schools ({matchSchools.length})
                </h4>
                <div className="space-y-3">
                  {matchSchools.map((school, index) => (
                    <SchoolCard key={index} school={school} />
                  ))}
                </div>
              </div>
            )}

            {/* Safety Schools */}
            {safetySchools.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  Safety Schools ({safetySchools.length})
                </h4>
                <div className="space-y-3">
                  {safetySchools.map((school, index) => (
                    <SchoolCard key={index} school={school} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function getPolicyBadgeStyle(policy: string) {
  switch (policy) {
    case "Test Required":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800";
    case "Test Blind":
      return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
    default: // Test Optional
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
  }
}

function getProbabilityColor(prob: number): string {
  if (prob > 60) return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
  if (prob >= 25) return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
  return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
}

function SchoolCard({ school }: { school: RecommendedSchool }) {
  // Use hard-coded override for known Test Required schools
  const testPolicy: TestPolicyType = isTestRequiredSchool(school.name)
    ? "Test Required"
    : (school.testPolicy || "Test Optional");

  // Cap probability at 95%, floor at 1%
  const probability = school.acceptanceProbability
    ? Math.max(1, Math.min(95, school.acceptanceProbability))
    : null;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <a
              href={school.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline hover:text-primary transition-colors"
            >
              {school.name}
            </a>
            <Badge variant={getTypeBadgeVariant(school.type)} className="text-xs">
              {getTypeIcon(school.type)}
              <span className="ml-1">{getTypeLabel(school.type)}</span>
            </Badge>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${getPolicyBadgeStyle(testPolicy)}`}>
              <FileCheck className="h-2.5 w-2.5" />
              {testPolicy}
            </span>
            {probability != null && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${getProbabilityColor(probability)}`}>
                Your Odds: {probability}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {school.region}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {getSizeLabel(school.campusSize)}
            </span>
            {school.enrollment && (
              <span className="text-muted-foreground/75">
                ({formatEnrollment(school.enrollment)})
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{school.matchReasoning}</p>
        </div>
      </div>
    </div>
  );
}
