"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CATEGORIES } from "@/lib/types";
import type { ModsResponse } from "@/lib/types";

export interface FilterState {
  cat: string;
  sort: string;
  withLinks: boolean;
  source: string;
}

interface FiltersProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  data: ModsResponse | undefined;
  resultCount: number;
}

const CAT_CHIP_STYLES: Record<string, string> = {
  all: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  vehicle: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  map: "border-lime-500/40 bg-lime-500/15 text-lime-300",
  skin: "border-pink-500/40 bg-pink-500/15 text-pink-300",
  parts: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  request: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  info: "border-zinc-500/40 bg-zinc-500/15 text-zinc-300",
  other: "border-zinc-500/40 bg-zinc-500/15 text-zinc-300",
};

export function Filters({ filters, onChange, data, resultCount }: FiltersProps) {
  const catLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => onChange({ ...filters, cat: c.key })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              filters.cat === c.key
                ? CAT_CHIP_STYLES[c.key] ?? CAT_CHIP_STYLES.other
                : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
            aria-pressed={filters.cat === c.key}
          >
            {c.label}
          </button>
        ))}

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="with-links"
              checked={filters.withLinks}
              onCheckedChange={(v) => onChange({ ...filters, withLinks: v })}
              aria-label="Only show mods with download links"
            />
            <Label htmlFor="with-links" className="text-xs text-muted-foreground cursor-pointer">
              Ready to download
            </Label>
          </div>

          <Select value={filters.source} onValueChange={(v) => onChange({ ...filters, source: v })}>
            <SelectTrigger className="h-8 w-[170px] text-xs bg-secondary/40 border-border" aria-label="Filter by subreddit">
              <SelectValue placeholder="All subreddits" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subreddits</SelectItem>
              {(data?.stats.sources ?? []).map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  r/{s.name} ({s.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.sort} onValueChange={(v) => onChange({ ...filters, sort: v })}>
            <SelectTrigger className="h-8 w-[140px] text-xs bg-secondary/40 border-border" aria-label="Sort order">
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

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {resultCount} result{resultCount === 1 ? "" : "s"}
        {filters.cat !== "all" && <> in {catLabel(filters.cat)}</>}
        {filters.withLinks && <> with decoded download links</>}
      </p>
    </div>
  );
}
