"use client";
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { RecommendedSchool, RegionType, CampusSizeType, NCAAdivision, ProgramType } from "@/lib/types";
import { REGIONS, CAMPUS_SIZES, NCAA_DIVISIONS, PROGRAM_FILTERS } from "@/lib/constants";
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
  schoolCount?: number;
}

function selectDisplaySchools(
  allSchools: RecommendedSchool[],
  regions: RegionType[],
  sizes: CampusSizeType[],
  types: string[],
  ncaaDivisions: NCAAdivision[] = [],
  programs: ProgramType[] = [],
  perCategory: number = 3
): RecommendedSchool[] {
  const pool = allSchools.filter((school) => {
    const regionMatch = regions.length === 0 || regions.includes(school.region);
    const sizeMatch = sizes.length === 0 || sizes.includes(school.campusSize);
    const typeMatch = types.length === 0 || types.includes(school.type);
    const ncaaMatch = ncaaDivisions.length === 0 || (school.ncaaDivision && ncaaDivisions.includes(school.ncaaDivision));
    const programMatch = programs.length === 0 || (school.programs && programs.some(p => school.programs!.includes(p)));
    return regionMatch && sizeMatch && typeMatch && ncaaMatch && programMatch;
  });

  const safety = pool.filter((s) => s.type === "safety").slice(0, perCategory);
  const match = pool.filter((s) => s.type === "match").slice(0, perCategory);
  const reach = pool.filter((s) => s.type === "reach").slice(0, perCategory);

  const picked = [...safety, ...match, ...reach];
  const total = perCategory * 3;

  if (picked.length < total) {
    const pickedNames = new Set(picked.map((s) => s.name));
    const leftovers = pool.filter((s) => !pickedNames.has(s.name));
    picked.push(...leftovers.slice(0, total - picked.length));
  }

  return picked;
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
  const [selectedNCAA, setSelectedNCAA] = useState<NCAAdivision[]>([]);
  const [selectedPrograms, setSelectedPrograms] = useState<ProgramType[]>([]);
  const [pendingRegions, setPendingRegions] = useState<RegionType[]>([]);
  const [pendingSizes, setPendingSizes] = useState<CampusSizeType[]>([]);
  const [pendingTypes, setPendingTypes] = useState<string[]>([]);
  const [pendingNCAA, setPendingNCAA] = useState<NCAAdivision[]>([]);
  const [pendingPrograms, setPendingPrograms] = useState<ProgramType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RecommendedSchool[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const displaySchools = useMemo(
    () => selectDisplaySchools(allSchools, selectedRegions, selectedSizes, selectedTypes, selectedNCAA, selectedPrograms, Math.floor(schoolCount / 3)),
    [allSchools, selectedRegions, selectedSizes, selectedTypes, selectedNCAA, selectedPrograms, schoolCount]
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

  const filtersApplied = selectedRegions.length > 0 || selectedSizes.length > 0 || selectedTypes.length > 0 || selectedNCAA.length > 0 || selectedPrograms.length > 0;

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

  const toggleNCAA = (division: NCAAdivision) => {
    setPendingNCAA((prev) =>
      prev.includes(division) ? prev.filter((d) => d !== division) : [...prev, division]
    );
  };

  const removeNCAAChip = (division: NCAAdivision) => {
    const newNCAA = selectedNCAA.filter((d) => d !== division);
    setSelectedNCAA(newNCAA);
    setPendingNCAA(newNCAA);
  };

  const toggleProgram = (program: ProgramType) => {
    setPendingPrograms((prev) =>
      prev.includes(program) ? prev.filter((p) => p !== program) : [...prev, program]
    );
  };

  const removeProgramChip = (program: ProgramType) => {
    const newPrograms = selectedPrograms.filter((p) => p !== program);
    setSelectedPrograms(newPrograms);
    setPendingPrograms(newPrograms);
  };

  const clearAllFilters = () => {
    setSelectedRegions([]);
    setSelectedSizes([]);
    setSelectedTypes([]);
    setSelectedNCAA([]);
    setSelectedPrograms([]);
    setPendingRegions([]);
    setPendingSizes([]);
    setPendingTypes([]);
    setPendingNCAA([]);
    setPendingPrograms([]);
    setSearchQuery("");
  };

  const applyFilters = () => {
    setSelectedRegions([...pendingRegions]);
    setSelectedSizes([...pendingSizes]);
    setSelectedTypes([...pendingTypes]);
    setSelectedNCAA([...pendingNCAA]);
    setSelectedPrograms([...pendingPrograms]);
  };

  const hasFilterChanges =
    JSON.stringify([...pendingRegions].sort()) !== JSON.stringify([...selectedRegions].sort()) ||
    JSON.stringify([...pendingSizes].sort()) !== JSON.stringify([...selectedSizes].sort()) ||
    JSON.stringify([...pendingTypes].sort()) !== JSON.stringify([...selectedTypes].sort()) ||
    JSON.stringify([...pendingNCAA].sort()) !== JSON.stringify([...selectedNCAA].sort()) ||
    JSON.stringify([...pendingPrograms].sort()) !== JSON.stringify([...selectedPrograms].sort());

  const reachSchools = displaySchools.filter((s) => s.type === "reach");
  const matchSchools = displaySchools.filter((s) => s.type === "match");
  const safetySchools = displaySchools.filter((s) => s.type === "safety");

  return (
    <Card className="rounded-xl border-warmgray-200 shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-teal" />
              <CardTitle className="text-charcoal">Recommended Schools</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              National search based on course rigor and academic alignment
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-warmgray-200 bg-white p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-charcoal">
            <SlidersHorizontal className="h-4 w-4 text-teal" />
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
                  <span className="text-sm text-charcoal">{region}</span>
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
                  <span className="text-sm text-charcoal">
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
                  <span className="text-sm text-charcoal capitalize">{type}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              NCAA Division
            </p>
            <div className="flex flex-wrap gap-3">
              {NCAA_DIVISIONS.map((div) => (
                <label key={div.value} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={pendingNCAA.includes(div.value)}
                    onCheckedChange={() => toggleNCAA(div.value)}
                  />
                  <span className="text-sm text-charcoal">{div.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Programs &amp; Features
            </p>
            <div className="flex flex-wrap gap-2">
              {PROGRAM_FILTERS.map((prog) => (
                <button
                  key={prog.value}
                  type="button"
                  onClick={() => toggleProgram(prog.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    pendingPrograms.includes(prog.value)
                      ? "bg-teal text-white border-teal"
                      : "bg-white text-charcoal border-warmgray-300 hover:border-teal hover:text-teal"
                  }`}
                >
                  {prog.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={applyFilters}
              disabled={!hasFilterChanges}
              size="sm"
              className="bg-teal hover:bg-teal-dark text-white rounded-lg transition-colors duration-200"
            >
              Apply Filters
            </Button>
            {filtersApplied && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-charcoal">
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
                className="bg-teal text-white rounded-full pl-2 pr-1 gap-1 cursor-pointer hover:bg-teal-dark"
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
                  className="bg-teal text-white rounded-full pl-2 pr-1 gap-1 cursor-pointer hover:bg-teal-dark"
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
                className="bg-teal text-white rounded-full pl-2 pr-1 gap-1 cursor-pointer hover:bg-teal-dark capitalize"
                onClick={() => removeTypeChip(type)}
              >
                {type === "reach" ? <TrendingUp className="h-3 w-3" /> : type === "match" ? <Target className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                {type}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
            {selectedNCAA.map((div) => (
              <Badge
                key={div}
                className="bg-teal text-white rounded-full pl-2 pr-1 gap-1 cursor-pointer hover:bg-teal-dark"
                onClick={() => removeNCAAChip(div)}
              >
                {div}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
            {selectedPrograms.map((prog) => (
              <Badge
                key={prog}
                className="bg-teal text-white rounded-full pl-2 pr-1 gap-1 cursor-pointer hover:bg-teal-dark"
                onClick={() => removeProgramChip(prog)}
              >
                {prog}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-charcoal">
            <Search className="h-4 w-4 text-teal" />
            Search for a Specific School
          </div>
          <input
            type="text"
            placeholder="Type a school name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-warmgray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal/20 focus:border-teal transition-colors"
          />
          {isSearching && <p className="text-sm text-teal">Searching...</p>}
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
          <span>
            {displaySchools.length} schools
            ({reachSchools.length} reach, {matchSchools.length} match, {safetySchools.length} safety)
          </span>
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
                <h4 className="text-sm font-semibold text-safegreen-dark mb-3 flex items-center gap-2 border-l-4 border-safegreen pl-3">
                  <Shield className="h-4 w-4 text-safegreen-dark" />
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
                <h4 className="text-sm font-semibold text-teal mb-3 flex items-center gap-2 border-l-4 border-teal pl-3">
                  <Target className="h-4 w-4 text-teal" />
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
                <h4 className="text-sm font-semibold text-coral mb-3 flex items-center gap-2 border-l-4 border-coral pl-3">
                  <TrendingUp className="h-4 w-4 text-coral" />
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

function SchoolCard({ school }: { school: RecommendedSchool }) {
  const borderColor =
    school.type === "reach" ? "border-l-coral" :
    school.type === "match" ? "border-l-teal" :
    "border-l-safegreen";

  return (
    <div className={`rounded-xl border border-warmgray-200 bg-white p-4 border-l-4 ${borderColor} transition-shadow hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <a
              href={school.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-lg text-charcoal hover:text-teal hover:underline transition-colors"
            >
              {school.name}
            </a>
            {school.ncaaDivision && (
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                school.ncaaDivision === "DI" ? "border-purple-300 text-purple-800 bg-purple-100" :
                school.ncaaDivision === "DII" ? "border-indigo-300 text-indigo-800 bg-indigo-100" :
                school.ncaaDivision === "DIII" ? "border-cyan-300 text-cyan-800 bg-cyan-100" :
                "border-warmgray-300 text-muted-foreground bg-warmgray-50"
              }`}>
                {school.ncaaDivision}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
              school.type === "reach" ? "bg-coral text-white" :
              school.type === "match" ? "bg-teal text-white" :
              "bg-safegreen text-white"
            }`}>
              {getTypeIcon(school.type)}
              <span>{getTypeLabel(school.type)}</span>
            </span>
            {school.testPolicy ? (
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                school.testPolicy === "Test Optional" ? "border-green-300 text-green-800 bg-green-100" :
                school.testPolicy === "Test Required" ? "border-red-300 text-red-800 bg-red-100" :
                school.testPolicy === "Test Blind" ? "border-blue-300 text-blue-800 bg-blue-100" :
                "border-warmgray-300 text-muted-foreground bg-warmgray-50"
              }`}>
                {school.testPolicy}
              </span>
            ) : (
              <span className="inline-flex items-center text-xs text-muted-foreground px-2 py-0.5 rounded-full border border-dashed border-warmgray-300">
                Test Policy: N/A
              </span>
            )}
            {school.acceptanceProbability !== undefined && school.acceptanceProbability !== null ? (
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                school.acceptanceProbability < 40 ? "border-coral bg-coral/10 text-coral" :
                school.acceptanceProbability >= 75 ? "border-safegreen bg-safegreen/10 text-safegreen-dark" :
                "border-teal bg-teal/10 text-teal"
              }`}>
                Your Odds: {school.acceptanceProbability < 10 ? "<10%" : school.acceptanceProbability > 95 ? "95%+" : school.acceptanceProbability + "%"}
              </span>
            ) : (
              <span className="inline-flex items-center text-xs text-muted-foreground px-2 py-0.5 rounded-full border border-dashed border-warmgray-300">
                Odds: N/A
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mb-2 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {school.region}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {getSizeLabel(school.campusSize)}
            </span>
            {school.enrollment && (
              <span className="text-gray-400">
                ({formatEnrollment(school.enrollment)})
              </span>
            )}
          </div>
          {school.programs && school.programs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {school.programs.map((prog) => (
                <span key={prog} className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-warmgray-50 text-muted-foreground border border-warmgray-200">
                  {prog}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-gray-600">{school.matchReasoning}</p>
        </div>
      </div>
    </div>
  );
}
