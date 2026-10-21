"use client";

import { RefreshCw, Radio, Search, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SyncInfo } from "@/lib/types";
import { RelativeTime } from "./relative-time";

interface HeaderProps {
  query: string;
  onQueryChange: (v: string) => void;
  sync: SyncInfo | undefined;
  refreshing: boolean;
  onRefresh: () => void;
}

export function Header({ query, onQueryChange, sync, refreshing, onRefresh }: HeaderProps) {
  const lastSyncOk = sync?.lastResult === "ok" || sync?.lastResult === "partial";
  const degraded = Boolean(sync?.lastError) && !lastSyncOk;

  return (
    <header className="sticky top-0 z-40 w-full">
      {/* Jamaican flag strip */}
      <div className="jamaica-strip h-1 w-full" aria-hidden="true" />
      <div className="border-b border-border/80 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 shrink-0" aria-label="JamFinds home">
            <span className="font-[family-name:var(--font-display)] text-lg tracking-tight">
              <span className="text-foreground">Jam</span>
              <span className="text-gradient-jam">Finds</span>
            </span>
          </a>

          {/* LIVE badge */}
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
            LIVE
          </span>

          {/* Sync status */}
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={sync?.lastError ?? ""}>
            <Radio className={`h-3.5 w-3.5 ${degraded ? "text-red-400" : "text-emerald-500"}`} aria-hidden="true" />
            {sync?.lastSyncAt ? (
              <>
                synced <RelativeTime iso={sync.lastSyncAt} />
                {degraded && <span className="text-red-400">(retrying)</span>}
              </>
            ) : (
              "connecting to reddit..."
            )}
          </span>

          {/* Search */}
          <div className="relative ml-auto w-full max-w-xs sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search mods, cars, maps, authors..."
              className="h-9 pl-8 bg-secondary/60 border-border"
              aria-label="Search mods"
            />
          </div>

          {/* Refresh */}
          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-9 gap-1.5 border-border shrink-0"
            title="Force sync from Reddit now"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            asChild
            className="h-9 gap-1.5 shrink-0 hidden lg:inline-flex text-muted-foreground hover:text-foreground"
          >
            <a href="https://www.reddit.com/r/Beamng_Jamaica/" target="_blank" rel="noreferrer" title="Visit the subreddit">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              r/Beamng_Jamaica
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
