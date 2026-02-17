"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, School, ChevronDown } from "lucide-react";

interface SchoolEntry {
  name: string;
  city: string;
}

export interface SelectedSchool {
  name: string;
  city: string;
  state: string;
}

interface HighSchoolSearchProps {
  onSelect: (school: SelectedSchool | null) => void;
  disabled?: boolean;
  initialState?: string;
}

const US_STATES = [
  { value: "", label: "Select state..." },
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" }, { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" }, { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" }, { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" }, { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" }, { value: "IL", label: "Illinois" }, { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" }, { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" }, { value: "ME", label: "Maine" }, { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" }, { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" }, { value: "MO", label: "Missouri" }, { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" }, { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" }, { value: "NM", label: "New Mexico" }, { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" }, { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" }, { value: "OR", label: "Oregon" }, { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" }, { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" }, { value: "TX", label: "Texas" }, { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" }, { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" }, { value: "WI", label: "Wisconsin" }, { value: "WY", label: "Wyoming" },
];

// Cache loaded state data so we don't re-fetch
const stateDataCache: Record<string, SchoolEntry[]> = {};

export function HighSchoolSearch({ onSelect, disabled, initialState }: HighSchoolSearchProps) {
  const [state, setState] = useState(initialState || "");
  const [schools, setSchools] = useState<SchoolEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedSchool | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load school data when state changes
  useEffect(() => {
    if (!state) {
      setSchools([]);
      return;
    }

    if (stateDataCache[state]) {
      setSchools(stateDataCache[state]);
      return;
    }

    setLoading(true);
    fetch(`/data/schools/${state}.json`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data: SchoolEntry[]) => {
        stateDataCache[state] = data;
        setSchools(data);
      })
      .catch(() => {
        setSchools([]);
      })
      .finally(() => setLoading(false));
  }, [state]);

  // Filter schools based on query
  const filtered = query.length >= 2
    ? schools.filter((s) =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.city.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = useCallback((school: SchoolEntry) => {
    const sel: SelectedSchool = { name: school.name, city: school.city, state };
    setSelected(sel);
    setQuery("");
    setIsOpen(false);
    onSelect(sel);
  }, [state, onSelect]);

  const handleClear = useCallback(() => {
    setSelected(null);
    setQuery("");
    onSelect(null);
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(filtered[highlightIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // If a school is selected, show the selection
  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-teal/30 bg-teal/5 px-4 py-3">
        <School className="h-5 w-5 text-teal flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-charcoal truncate">{selected.name}</p>
          <p className="text-xs text-muted-foreground">{selected.city}, {selected.state}</p>
        </div>
        <button
          onClick={handleClear}
          disabled={disabled}
          className="text-xs text-muted-foreground hover:text-charcoal transition-colors disabled:opacity-50"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {/* State selector */}
        <div className="relative">
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setQuery("");
              setIsOpen(false);
              setSelected(null);
              onSelect(null);
            }}
            disabled={disabled}
            className="w-full min-w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 appearance-none pr-8"
          >
            {US_STATES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>

        {/* Search input */}
        <div className="relative flex-1 min-w-[240px]" ref={dropdownRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(e.target.value.length >= 2);
                setHighlightIndex(-1);
              }}
              onFocus={() => {
                if (query.length >= 2) setIsOpen(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                !state
                  ? "Select a state first..."
                  : loading
                  ? "Loading schools..."
                  : `Search ${schools.length.toLocaleString()} schools...`
              }
              disabled={disabled || !state || loading}
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
          </div>

          {/* Results dropdown */}
          {isOpen && filtered.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-[280px] overflow-y-auto">
              {filtered.map((school, i) => (
                <button
                  key={`${school.name}-${school.city}`}
                  onClick={() => handleSelect(school)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    i === highlightIndex
                      ? "bg-teal/10 text-charcoal"
                      : "hover:bg-warmgray-50"
                  }`}
                >
                  <span className="font-medium">{school.name}</span>
                  <span className="text-muted-foreground ml-2">{school.city}</span>
                </button>
              ))}
            </div>
          )}

          {/* No results message */}
          {isOpen && query.length >= 2 && filtered.length === 0 && !loading && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg px-3 py-3 text-sm text-muted-foreground">
              No schools found. Try a different search or upload your school&apos;s profile PDF instead.
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Don&apos;t see your school? Private and specialized schools may not be listed.
        You can skip this and upload your school&apos;s profile PDF below instead.
      </p>
    </div>
  );
}
