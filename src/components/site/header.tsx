"use client";

import { RefreshCw, Radio, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SyncInfo } from "@/lib/types";
import { RelativeTime } from "./relative-time";

interface HeaderProps {
  sync: SyncInfo | undefined;
  refreshing: boolean;
  onRefresh: () => void;
}

export function Header({ sync, refreshing, onRefresh }: HeaderProps) {
  const lastSyncOk = sync?.lastResult === "ok" || sync?.lastResult === "partial";
  const degraded = Boolean(sync?.lastError) && !lastSyncOk;

  return (
    <header className="sticky top-0 z-40 w-full">
      {/* Jamaican flag strip */}
      <div className="jamaica-strip h-1 w-full" aria-hidden="true" />
      <div className="border-b border-border bg-background/80 backdrop-blur-lg backdrop-saturate-150 supports-[backdrop-filter]:bg-background/55">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2.5 px-4 sm:px-6">
          {/* Logo */}
          <a
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="JamFinds home"
          >
            <span className="font-[family-name:var(--font-display)] text-lg tracking-tight">
              <span className="text-foreground">Jam</span>
              <span className="text-gradient-jam">Finds</span>
            </span>
          </a>

          {/* LIVE badge */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-semibold leading-none text-primary">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            LIVE
          </span>

          {/* Sync status */}
          <span
            className="hidden items-center gap-1.5 text-xs text-muted-foreground md:inline-flex"
            title={sync?.lastError ?? ""}
          >
            <Radio className={`h-3.5 w-3.5 ${degraded ? "text-destructive" : "text-primary"}`} aria-hidden="true" />
            {sync?.lastSyncAt ? (
              <>
                synced <RelativeTime iso={sync.lastSyncAt} />
                {degraded && <span className="text-destructive">(retrying)</span>}
              </>
            ) : (
              "connecting to sources..."
            )}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Refresh */}
            <Button
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={refreshing}
              className="h-11 gap-1.5 border-border sm:h-9"
              title="Force sync from all sources now"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              asChild
              className="hidden h-9 gap-1.5 text-muted-foreground hover:text-foreground lg:inline-flex"
            >
              <a href="https://www.reddit.com/r/Beamng_Jamaica/" target="_blank" rel="noreferrer" title="Visit the subreddit">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                r/Beamng_Jamaica
              </a>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
