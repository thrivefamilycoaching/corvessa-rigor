"use client";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { RecommendedSchool, RegionType, CampusSizeType } from "@/lib/types";
import { REGIONS, CAMPUS_SIZES } from "@/lib/constants";
import {
  GraduationCap,
  TrendingUp,
  Target,
  Shield,
  MapPin,
  Users,
  X,
  SlidersHorizontal,
  Search,
} from "lucide-react";

interface RecommendedSchoolsProps {
  schools: RecommendedSchool[];
  transcriptSummary: string;
  schoolProfileSummary: string;
  overallScore: number;
}

function selectDisplaySchools(
  allSchools: RecommendedSchool[],
  regions: RegionType[],
  sizes: CampusSizeType[],
  types: string[]
): RecommendedSchool[] {
  const hasFilters = regions.length > 0 || sizes.length > 0 || types.length > 0;

  if (!hasFilters) {
    const reach = allSchools.filter((s) => s.type === "reach").slice(0, 3);
    const match = allSchools.filter((s) => s.type === "match").slice(0, 3);
    const safety = allSchools.filter((s) => s.type === "safety").slice(0, 3);
    return [...reach, ...match, ...safety];
  }

  // When filters active: show ALL matching schools first, then fill to 9
  const filtered = allSchools.filter((school) => {
    const regionMatch = regions.length === 0 || regions.includes(school.region);
    const sizeMatch = sizes.length === 0 || sizes.includes(school.campusSize);
    const typeMatch = types.length === 0 || types.includes(school.type);
    return regionMatch && sizeMatch && typeMatch;
  });

  const usedNames = new Set<string>();
  const result: RecommendedSchool[] = [];

  // First pass: try to get at least 1 of each type from filtered
  for (const type of ["reach", "match", "safety"] as const) {
    const ofType = filtered.filter((s) => s.type === type && !usedNames.has(s.name));
    if (ofType.length > 0) {
      result.push(ofType[0]);
      usedNames.add(ofType[0].name);
    }
  }

  // Second pass: fill remaining slots from filtered schools
  for (const school of filtered) {
    if (result.length >= 9) break;
    if (!usedNames.has(school.name)) {
      result.push(school);
      usedNames.add(school.name);
    }
  }

  // Third pass: if still under 9, fill from unfiltered pool
  if (result.length < 9) {
    for (const school of allSchools) {
      if (result.length >= 9) break;
      if (!usedNames.has(school.name)) {
        result.push(school);
        usedNames.add(school.name);
      }
    }
  }

  return result;
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
  schools: allSchools,
  transcriptSummary,
  schoolProfileSummary,
  overallScore,
}: RecommendedSchoolsProps) {
  const [selectedRegions, setSelectedRegions] = useState<RegionType[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<CampusSizeType[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [pendingRegions, setPendingRegions] = useState<RegionType[]>([]);
  const [pendingSizes, setPendingSizes] = useState<CampusSizeType[]>([]);
  const [pendingTypes, setPendingTypes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const displaySchools = useMemo(
    () => selectDisplaySchools(allSchools, selectedRegions, selectedSizes, selectedTypes),
    [allSchools, selectedRegions, selectedSizes, selectedTypes]
  );

  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    const query = searchQuery.toLowerCase();
    return allSchools.filter((s) => s.name.toLowerCase().includes(query));
  }, [allSchools, searchQuery]);

  const filterMatchCount = useMemo(() => {
    if (selectedRegions.length === 0 && selectedSizes.length === 0 && selectedTypes.length === 0) return displaySchools.length;
    return displaySchools.filter((school) => {
      const regionMatch = selectedRegions.length === 0 || selectedRegions.includes(school.region);
      const sizeMatch = selectedSizes.length === 0 || selectedSizes.includes(school.campusSize);
      const typeMatch = selectedTypes.length === 0 || selectedTypes.includes(school.type);
      return regionMatch && sizeMatch && typeMatch;
    }).length;
  }, [displaySchools, selectedRegions, selectedSizes, selectedTypes]);

  const filtersApplied = selectedRegions.length > 0 || selectedSizes.length > 0 || selectedTypes.length > 0;

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
  };

  const removeSizeChip = (size: CampusSizeType) => {
    const newSizes = selectedSizes.filter((s) => s !== size);
    setSelectedSizes(newSizes);
    setPendingSizes(newSizes);
  };

  const toggleType = (type: string) => {
    setPendingTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const removeTypeChip = (type: string) => {
    const newTypes = selectedTypes.filter((t) => t !== type);
    setSelectedTypes(newTypes);
    setPendingTypes(newTypes);
  };

  const clearAllFilters = () => {
    setSelectedRegions([]);
    setSelectedSizes([]);
    setSelectedTypes([]);
    setPendingRegions([]);
    setPendingSizes([]);
    setPendingTypes([]);
    setSearchQuery("");
  };

  const applyFilters = () => {
    setSelectedRegions([...pendingRegions]);
    setSelectedSizes([...pendingSizes]);
    setSelectedTypes([...pendingTypes]);
  };

  const hasFilterChanges =
    JSON.stringify([...pendingRegions].sort()) !== JSON.stringify([...selectedRegions].sort()) ||
    JSON.stringify([...pendingSizes].sort()) !== JSON.stringify([...selectedSizes].sort()) ||
    JSON.stringify([...pendingTypes].sort()) !== JSON.stringify([...selectedTypes].sort());

  const reachSchools = displaySchools.filter((s) => s.type === "reach");
  const matchSchools = displaySchools.filter((s) => s.type === "match");
  const safetySchools = displaySchools.filter((s) => s.type === "safety");

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

        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="h-4 w-4" />
            Filter Recommendations
          </div>

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

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Admission Likelihood
            </p>
            <div className="flex flex-wrap gap-3">
              {(["reach", "match", "safety"] as const).map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={pendingTypes.includes(type)}
                    onCheckedChange={() => toggleType(type)}
                  />
                  <span className="text-sm capitalize">{type}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={applyFilters}
              disabled={!hasFilterChanges}
              size="sm"
            >
              Apply Filters
            </Button>
            {filtersApplied && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                Clear All
              </Button>
            )}
            {hasFilterChanges && (
              <span className="text-xs text-muted-foreground">
                Click Apply to update results
              </span>
            )}
          </div>
        </div>

        {filtersApplied && (
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
            {selectedTypes.map((type) => (
              <Badge
                key={type}
                variant="secondary"
                className="pl-2 pr-1 gap-1 cursor-pointer hover:bg-secondary/80 capitalize"
                onClick={() => removeTypeChip(type)}
              >
                {type === "reach" ? <TrendingUp className="h-3 w-3" /> : type === "match" ? <Target className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                {type}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4" />
            Search for a Specific School
          </div>
          <input
            type="text"
            placeholder="Type a school name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((school, index) => (
                <SchoolCard key={`search-${index}`} school={school} isFilterMatch={true} />
              ))}
            </div>
          )}
          {searchQuery.length >= 2 && searchResults.length === 0 && (
            <p className="text-sm text-muted-foreground">No matching schools found in the recommendation pool.</p>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{displaySchools.length} schools</span>
          <span>
            ({reachSchools.length} reach, {matchSchools.length} match, {safetySchools.length} safety)
          </span>
          {filtersApplied && filterMatchCount < displaySchools.length && (
            <span className="text-xs">
              · {filterMatchCount} match your filters, {displaySchools.length - filterMatchCount} additional shown to fill 3/3/3
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {displaySchools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GraduationCap className="h-8 w-8 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              No schools available. Try adjusting your criteria.
            </p>
          </div>
        ) : (
          <>
            {reachSchools.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#E87722]" />
                  Reach Schools ({reachSchools.length})
                </h4>
                <div className="space-y-3">
                  {reachSchools.map((school, index) => (
                    <SchoolCard
                      key={index}
                      school={school}
                      isFilterMatch={
                        !filtersApplied ||
                        ((selectedRegions.length === 0 || selectedRegions.includes(school.region)) &&
                         (selectedSizes.length === 0 || selectedSizes.includes(school.campusSize)) &&
                         (selectedTypes.length === 0 || selectedTypes.includes(school.type)))
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {matchSchools.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Match Schools ({matchSchools.length})
                </h4>
                <div className="space-y-3">
                  {matchSchools.map((school, index) => (
                    <SchoolCard
                      key={index}
                      school={school}
                      isFilterMatch={
                        !filtersApplied ||
                        ((selectedRegions.length === 0 || selectedRegions.includes(school.region)) &&
                         (selectedSizes.length === 0 || selectedSizes.includes(school.campusSize)) &&
                         (selectedTypes.length === 0 || selectedTypes.includes(school.type)))
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {safetySchools.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  Safety Schools ({safetySchools.length})
                </h4>
                <div className="space-y-3">
                  {safetySchools.map((school, index) => (
                    <SchoolCard
                      key={index}
                      school={school}
                      isFilterMatch={
                        !filtersApplied ||
                        ((selectedRegions.length === 0 || selectedRegions.includes(school.region)) &&
                         (selectedSizes.length === 0 || selectedSizes.includes(school.campusSize)) &&
                         (selectedTypes.length === 0 || selectedTypes.includes(school.type)))
                      }
                    />
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

function SchoolCard({ school, isFilterMatch }: { school: RecommendedSchool; isFilterMatch: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${!isFilterMatch ? "opacity-60 border-dashed" : ""}`}>
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
            {school.testPolicy && (
              <Badge variant="outline" className="text-xs">
                📋 {school.testPolicy}
              </Badge>
            )}
            {school.acceptanceProbability !== undefined && (
              <Badge variant="outline" className="text-xs">
                Your Odds: {school.acceptanceProbability}%
              </Badge>
            )}
            {!isFilterMatch && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Outside filter
              </Badge>
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
