"use client";

import { Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CATEGORIES, CATEGORY_STYLES } from "@/lib/types";
import type { ModsResponse } from "@/lib/types";
import { SOURCE_DEFS } from "@/lib/sources";

export interface FilterState {
  cat: string;
  sort: string;
  withLinks: boolean;
  source: string;
}

export const DEFAULT_FILTERS: FilterState = { cat: "all", sort: "new", withLinks: false, source: "all" };

interface FiltersProps {
  query: string;
  onQueryChange: (v: string) => void;
  filters: FilterState;
  onChange: (f: FilterState) => void;
  data: ModsResponse | undefined;
  resultCount: number;
}

const chipBase =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium leading-none transition-all duration-150 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 sm:px-3.5 sm:text-xs";

export function Filters({ query, onQueryChange, filters, onChange, data, resultCount }: FiltersProps) {
  const catLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;
  const isFiltered = filters.cat !== "all" || filters.withLinks || filters.source !== "all" || query.trim() !== "";

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 shadow-sm sm:p-4">
      {/* Row 1 — search + controls */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search mods, cars, maps, authors..."
            className="h-11 border-input bg-secondary/50 pl-9 pr-9 text-[15px] transition-colors focus-visible:bg-secondary/70 sm:h-10 sm:text-sm"
            aria-label="Search mods"
            enterKeyHint="search"
          />
          {query && (
            <button
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select value={filters.source} onValueChange={(v) => onChange({ ...filters, source: v })}>
            <SelectTrigger
              className="h-11 min-w-0 flex-1 text-[13px] sm:h-10 sm:flex-none sm:w-[168px] sm:text-xs"
              aria-label="Filter by source"
            >
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {(data?.stats.sources ?? []).map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {SOURCE_DEFS.find((d) => d.key === s.name)?.label ?? s.name} ({s.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.sort} onValueChange={(v) => onChange({ ...filters, sort: v })}>
            <SelectTrigger
              className="h-11 min-w-0 flex-1 text-[13px] sm:h-10 sm:flex-none sm:w-[136px] sm:text-xs"
              aria-label="Sort order"
            >
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Newest first</SelectItem>
              <SelectItem value="old">Oldest first</SelectItem>
              <SelectItem value="az">A → Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2 — category chips (scrollable rail on mobile) + download toggle */}
      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div
          className="no-scrollbar -mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          role="group"
          aria-label="Filter by category"
        >
          {CATEGORIES.map((c) => {
            const active = filters.cat === c.key;
            return (
              <button
                key={c.key}
                onClick={() => onChange({ ...filters, cat: c.key })}
                className={`${chipBase} ${
                  active
                    ? CATEGORY_STYLES[c.key] ?? CATEGORY_STYLES.other
                    : "border-border bg-secondary/40 text-muted-foreground hover:border-foreground/25 hover:text-foreground"
                }`}
                aria-pressed={active}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 lg:ml-auto lg:pl-3">
          <Switch
            id="with-links"
            checked={filters.withLinks}
            onCheckedChange={(v) => onChange({ ...filters, withLinks: v })}
            aria-label="Only show mods with download links"
          />
          <Label htmlFor="with-links" className="cursor-pointer text-[13px] text-muted-foreground sm:text-xs">
            Ready to download
          </Label>
        </div>
      </div>

      {/* Results meta */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-3" aria-live="polite">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{resultCount}</span>{" "}
          result{resultCount === 1 ? "" : "s"}
          {filters.cat !== "all" && <> in {catLabel(filters.cat)}</>}
          {filters.withLinks && <> with download links</>}
          {filters.source !== "all" && <> from {SOURCE_DEFS.find((d) => d.key === filters.source)?.label ?? filters.source}</>}
        </p>
        {isFiltered && (
          <button
            onClick={() => {
              onQueryChange("");
              onChange(DEFAULT_FILTERS);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden="true" /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
