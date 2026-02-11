"use client";
import { useState, useMemo, useEffect } from "react";
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

interface DisplaySchool extends RecommendedSchool {
  outsideFilter?: boolean;
}

interface RecommendedSchoolsProps {
  schools: RecommendedSchool[];
  transcriptSummary: string;
  schoolProfileSummary: string;
  overallScore: number;
  schoolCount?: number;
}

function selectDisplaySchools(
  allSchools: RecommendedSchool[],
  regions: RegionType[],
  sizes: CampusSizeType[],
  types: string[],
  perCategory: number = 3
): DisplaySchool[] {
  const hasFilters = regions.length > 0 || sizes.length > 0 || types.length > 0;

  if (!hasFilters) {
    const safety = allSchools.filter((s) => s.type === "safety").slice(0, perCategory);
    const match = allSchools.filter((s) => s.type === "match").slice(0, perCategory);
    const reach = allSchools.filter((s) => s.type === "reach").slice(0, perCategory);
    return [...safety, ...match, ...reach];
  }

  // Schools matching all active filters
  const matched: DisplaySchool[] = allSchools.filter((school) => {
    const regionMatch = regions.length === 0 || regions.includes(school.region);
    const sizeMatch = sizes.length === 0 || sizes.includes(school.campusSize);
    const typeMatch = types.length === 0 || types.includes(school.type);
    return regionMatch && sizeMatch && typeMatch;
  });

  // Always show at least perCategory*3 schools — backfill from unfiltered pool
  const minSchools = perCategory * 3;
  if (matched.length >= minSchools) {
    return matched;
  }

  const matchedNames = new Set(matched.map((s) => s.name));
  const remaining = allSchools.filter((s) => !matchedNames.has(s.name));
  const backfill: DisplaySchool[] = remaining
    .slice(0, minSchools - matched.length)
    .map((s) => ({ ...s, outsideFilter: true }));

  return [...matched, ...backfill];
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
  schoolCount = 9,
}: RecommendedSchoolsProps) {
  const [selectedRegions, setSelectedRegions] = useState<RegionType[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<CampusSizeType[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [pendingRegions, setPendingRegions] = useState<RegionType[]>([]);
  const [pendingSizes, setPendingSizes] = useState<CampusSizeType[]>([]);
  const [pendingTypes, setPendingTypes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RecommendedSchool[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const displaySchools = useMemo(
    () => selectDisplaySchools(allSchools, selectedRegions, selectedSizes, selectedTypes, Math.floor(schoolCount / 3)),
    [allSchools, selectedRegions, selectedSizes, selectedTypes, schoolCount]
  );

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search-school?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

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
  const matchedCount = displaySchools.filter((s) => !s.outsideFilter).length;
  const outsideCount = displaySchools.filter((s) => s.outsideFilter).length;

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
          {isSearching && <p className="text-sm text-muted-foreground">Searching...</p>}
          {!isSearching && searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((school, index) => (
                <SchoolCard key={`search-${index}`} school={school} />
              ))}
            </div>
          )}
          {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <p className="text-sm text-muted-foreground">No matching schools found.</p>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {filtersApplied ? (
            <span>
              {matchedCount} {matchedCount === 1 ? "school matches" : "schools match"} your filters
              ({reachSchools.length} reach, {matchSchools.length} match, {safetySchools.length} safety)
              {outsideCount > 0 && ` + ${outsideCount} additional suggestions`}
            </span>
          ) : (
            <span>
              {displaySchools.length} schools
              ({reachSchools.length} reach, {matchSchools.length} match, {safetySchools.length} safety)
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
            {/* Safety Schools */}
            {safetySchools.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-green-600 mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  Safety Schools ({safetySchools.length})
                </h4>
                <div className="space-y-3">
                  {safetySchools.map((school, index) => (
                    <SchoolCard key={index} school={school} />
                  ))}
                </div>
              </div>
            )}

            {/* Match Schools */}
            {matchSchools.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-blue-800" />
                  Match Schools ({matchSchools.length})
                </h4>
                <div className="space-y-3">
                  {matchSchools.map((school, index) => (
                    <SchoolCard key={index} school={school} />
                  ))}
                </div>
              </div>
            )}

            {/* Reach Schools */}
            {reachSchools.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-orange-600 mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-600" />
                  Reach Schools ({reachSchools.length})
                </h4>
                <div className="space-y-3">
                  {reachSchools.map((school, index) => (
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

function SchoolCard({ school }: { school: DisplaySchool }) {
  const isOutside = school.outsideFilter;
  return (
    <div className={`rounded-lg border p-4 ${isOutside ? "opacity-50 border-dashed" : ""}`}>
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
            {isOutside && (
              <span className="inline-flex items-center text-xs text-muted-foreground px-2 py-0.5 rounded-full border border-dashed border-gray-400 bg-gray-50">
                Outside your filters
              </span>
            )}
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full text-white ${
              school.type === "reach" ? "bg-orange-600" :
              school.type === "match" ? "bg-blue-800" :
              "bg-green-600"
            }`}>
              {getTypeIcon(school.type)}
              <span>{getTypeLabel(school.type)}</span>
            </span>
            {school.testPolicy ? (
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                school.testPolicy === "Test Optional" ? "border-green-500 text-green-700 bg-green-50" :
                school.testPolicy === "Test Required" ? "border-red-500 text-red-700 bg-red-50" :
                school.testPolicy === "Test Blind" ? "border-blue-500 text-blue-700 bg-blue-50" :
                "border-gray-400 text-gray-600 bg-gray-50"
              }`}>
                {school.testPolicy}
              </span>
            ) : (
              <span className="inline-flex items-center text-xs text-muted-foreground px-2 py-0.5 rounded-full border border-dashed border-gray-300">
                Test Policy: N/A
              </span>
            )}
            {school.acceptanceProbability !== undefined && school.acceptanceProbability !== null ? (
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                school.acceptanceProbability < 40 ? "border-orange-500 text-orange-700 bg-orange-50" :
                school.acceptanceProbability >= 75 ? "border-green-500 text-green-700 bg-green-50" :
                "border-blue-500 text-blue-700 bg-blue-50"
              }`}>
                Your Odds: {school.acceptanceProbability < 10 ? "<10%" : school.acceptanceProbability > 95 ? "95%+" : school.acceptanceProbability + "%"}
              </span>
            ) : (
              <span className="inline-flex items-center text-xs text-muted-foreground px-2 py-0.5 rounded-full border border-dashed border-gray-300">
                Odds: N/A
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
