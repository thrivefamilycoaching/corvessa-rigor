"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { RecommendedSchool, RegionType, CampusSizeType } from "@/lib/types";
import { REGIONS, CAMPUS_SIZES } from "@/lib/constants";
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
} from "lucide-react";

interface RecommendedSchoolsProps {
  schools: RecommendedSchool[];
  transcriptSummary: string;
  schoolProfileSummary: string;
  overallScore: number;
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

export function RecommendedSchools({
  schools: initialSchools,
  transcriptSummary,
  schoolProfileSummary,
  overallScore,
}: RecommendedSchoolsProps) {
  const [schools, setSchools] = useState<RecommendedSchool[]>(initialSchools);
  const [selectedRegions, setSelectedRegions] = useState<RegionType[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<CampusSizeType[]>([]);
  const [pendingRegions, setPendingRegions] = useState<RegionType[]>([]);
  const [pendingSizes, setPendingSizes] = useState<CampusSizeType[]>([]);
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

  const removeRegionChip = (region: RegionType) => {
    const newRegions = selectedRegions.filter((r) => r !== region);
    setSelectedRegions(newRegions);
    setPendingRegions(newRegions);
    // Re-filter with updated selections
    applyFiltersWithValues(newRegions, selectedSizes);
  };

  const removeSizeChip = (size: CampusSizeType) => {
    const newSizes = selectedSizes.filter((s) => s !== size);
    setSelectedSizes(newSizes);
    setPendingSizes(newSizes);
    // Re-filter with updated selections
    applyFiltersWithValues(selectedRegions, newSizes);
  };

  const clearAllFilters = () => {
    setSelectedRegions([]);
    setSelectedSizes([]);
    setPendingRegions([]);
    setPendingSizes([]);
    setSchools(initialSchools);
    setFiltersApplied(false);
  };

  const applyFiltersWithValues = async (regions: RegionType[], sizes: CampusSizeType[]) => {
    // If no filters selected, show original results
    if (regions.length === 0 && sizes.length === 0) {
      setSchools(initialSchools);
      setFiltersApplied(false);
      return;
    }

    // Try to filter existing schools first (OR within groups, AND between groups)
    const filteredExisting = initialSchools.filter((school) => {
      const regionMatch = regions.length === 0 || regions.includes(school.region);
      const sizeMatch = sizes.length === 0 || sizes.includes(school.campusSize);
      return regionMatch && sizeMatch;
    });

    // If we have enough matching schools, use them
    if (filteredExisting.length >= 5) {
      setSchools(filteredExisting);
      setFiltersApplied(true);
      return;
    }

    // Otherwise, fetch new recommendations from GPT-4o
    setIsLoading(true);
    try {
      const newSchools = await getFilteredRecommendations({
        transcriptSummary,
        schoolProfileSummary,
        overallScore,
        regions,
        sizes,
      });
      setSchools(newSchools);
      setFiltersApplied(true);
    } catch (error) {
      console.error("Failed to fetch filtered recommendations:", error);
      setSchools(filteredExisting);
      setFiltersApplied(true);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    setSelectedRegions(pendingRegions);
    setSelectedSizes(pendingSizes);
    applyFiltersWithValues(pendingRegions, pendingSizes);
  };

  const hasFilterChanges =
    JSON.stringify(pendingRegions.sort()) !== JSON.stringify(selectedRegions.sort()) ||
    JSON.stringify(pendingSizes.sort()) !== JSON.stringify(selectedSizes.sort());

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
            {(selectedRegions.length > 0 || selectedSizes.length > 0) && (
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
        {(selectedRegions.length > 0 || selectedSizes.length > 0) && (
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
          </div>
        )}

        {/* Results Summary */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{schools.length} schools</span>
          {filtersApplied && <span>matching your filters</span>}
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

function SchoolCard({ school }: { school: RecommendedSchool }) {
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
