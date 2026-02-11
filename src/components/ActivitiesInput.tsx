"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import type { Activity } from "@/lib/activities";
import {
  searchActivities,
  ACTIVITY_CATEGORIES,
  ROLE_OPTIONS,
  YEARS_OPTIONS,
} from "@/lib/activities";

interface ActivitiesInputProps {
  activities: Activity[];
  onChange: (activities: Activity[]) => void;
  disabled?: boolean;
}

const MAX_ACTIVITIES = 15;

export function ActivitiesInput({
  activities,
  onChange,
  disabled,
}: ActivitiesInputProps) {
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = searchActivities(query);

  // Group results by category
  const grouped: Record<string, { name: string; category: string }[]> = {};
  for (const r of results) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addActivity = (name: string) => {
    if (activities.length >= MAX_ACTIVITIES) return;
    if (activities.some((a) => a.name === name)) return;
    onChange([...activities, { name, role: "Member", years: 1, yearsInRole: 1 }]);
    setQuery("");
    setShowDropdown(false);
  };

  const removeActivity = (index: number) => {
    onChange(activities.filter((_, i) => i !== index));
  };

  const updateRole = (index: number, role: string) => {
    const updated = [...activities];
    updated[index] = { ...updated[index], role };
    onChange(updated);
  };

  const updateYears = (index: number, years: number) => {
    const updated = [...activities];
    const current = updated[index];
    // Auto-correct yearsInRole if it exceeds new total years
    const yearsInRole = current.yearsInRole > years ? years : current.yearsInRole;
    updated[index] = { ...current, years, yearsInRole };
    onChange(updated);
  };

  const updateYearsInRole = (index: number, yearsInRole: number) => {
    const updated = [...activities];
    updated[index] = { ...updated[index], yearsInRole };
    onChange(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      if (results.length > 0) {
        addActivity(results[0].name);
      } else {
        addActivity(query.trim());
      }
    }
  };

  const atMax = activities.length >= MAX_ACTIVITIES;

  return (
    <div className="space-y-3">
      {/* Search input with autocomplete */}
      <div ref={containerRef} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={
            atMax
              ? "Maximum activities reached"
              : "Search activities or type a custom one..."
          }
          disabled={disabled || atMax}
          className="w-full rounded-lg border border-warmgray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground hover:border-teal/50 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 disabled:opacity-50"
        />
        {showDropdown && query.trim() && (
          <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-warmgray-200 bg-white shadow-lg">
            {Object.keys(grouped).length > 0 ? (
              Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-teal bg-warmgray-50">
                    {category}
                  </div>
                  {items.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => addActivity(item.name)}
                      disabled={activities.some((a) => a.name === item.name)}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors disabled:opacity-40"
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <button
                type="button"
                onClick={() => addActivity(query.trim())}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
              >
                Add &ldquo;{query.trim()}&rdquo; as custom activity
              </button>
            )}
          </div>
        )}
      </div>

      {/* Activity rows */}
      {activities.length > 0 && (
        <div className="space-y-2">
          {activities.map((activity, index) => (
            <div
              key={activity.name}
              className="rounded-lg border border-warmgray-200 bg-white px-3 py-2"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium truncate">
                  {activity.name} — {activity.years} year{activity.years > 1 ? "s" : ""} ({activity.role}, {activity.yearsInRole} yr)
                </span>
                <button
                  type="button"
                  onClick={() => removeActivity(index)}
                  disabled={disabled}
                  className="ml-2 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <label className="text-[11px] text-muted-foreground whitespace-nowrap">Total Yrs</label>
                  <select
                    value={activity.years}
                    onChange={(e) => updateYears(index, parseInt(e.target.value))}
                    disabled={disabled}
                    className="rounded-lg border border-warmgray-300 bg-white px-2 py-1 text-xs shadow-sm focus:border-teal"
                  >
                    {YEARS_OPTIONS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-[11px] text-muted-foreground whitespace-nowrap">Highest Role</label>
                  <select
                    value={activity.role}
                    onChange={(e) => updateRole(index, e.target.value)}
                    disabled={disabled}
                    className="rounded-lg border border-warmgray-300 bg-white px-2 py-1 text-xs shadow-sm focus:border-teal"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-[11px] text-muted-foreground whitespace-nowrap">Yrs in Role</label>
                  <select
                    value={activity.yearsInRole}
                    onChange={(e) => updateYearsInRole(index, parseInt(e.target.value))}
                    disabled={disabled}
                    className="rounded-lg border border-warmgray-300 bg-white px-2 py-1 text-xs shadow-sm focus:border-teal"
                  >
                    {YEARS_OPTIONS.filter((y) => y <= activity.years).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {activities.length} activit{activities.length === 1 ? "y" : "ies"} added
        {atMax && (
          <span className="ml-1 text-amber-600 dark:text-amber-400">
            (maximum {MAX_ACTIVITIES} reached)
          </span>
        )}
      </p>
    </div>
  );
}
