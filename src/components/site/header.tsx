"use client";

import { RefreshCw, Radio, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { SyncInfo } from "@/lib/types";
import { NotifyBell } from "./notify-bell";
import { RelativeTime } from "./relative-time";
import { LanguageSwitcher } from "./language-switcher";

interface HeaderProps {
  sync: SyncInfo | undefined;
  refreshing: boolean;
  onRefresh: () => void;
}

export function Header({ sync, refreshing, onRefresh }: HeaderProps) {
  const t = useTranslations("header");
  const lastSyncOk = sync?.lastResult === "ok" || sync?.lastResult === "partial";
  const degraded = Boolean(sync?.lastError) && !lastSyncOk;

  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2.5 px-4 sm:px-6">
          {/* Logo */}
          <a
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("home")}
          >
            {/* Brand monogram — live "found it" pulse mark (mirrors app/icon.svg) */}
            <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
              <rect width="64" height="64" rx="14" fill="#141220" />
              <path d="M17 41a19 19 0 0 1 30-15" stroke="#8B5CF6" strokeWidth="4.5" fill="none" strokeLinecap="round" opacity="0.45" />
              <path d="M23 42a12.5 12.5 0 0 1 20-9.5" stroke="#A78BFA" strokeWidth="4.5" fill="none" strokeLinecap="round" opacity="0.9" />
              <circle cx="43.5" cy="22" r="5.5" fill="#C4B5FD" />
            </svg>
            <span className="font-[family-name:var(--font-display)] text-lg tracking-tight">
              <span className="text-foreground">Jam</span>
              <span className="text-gradient-brand">Finds</span>
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
                {t("synced")} <RelativeTime iso={sync.lastSyncAt} />
                {degraded && <span className="text-destructive">{t("retrying")}</span>}
              </>
            ) : (
              t("connecting")
            )}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Language switcher (Task 16) */}
            <LanguageSwitcher />

            {/* Notify-me bell (Web Push) */}
            <NotifyBell />

            {/* Refresh */}
            <Button
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={refreshing}
              className="h-11 gap-1.5 border-border sm:h-9"
              title={t("refreshTitle")}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              asChild
              className="hidden h-9 gap-1.5 text-muted-foreground hover:text-foreground lg:inline-flex"
            >
              <a href="https://www.reddit.com/r/Beamng_Jamaica/" target="_blank" rel="noreferrer" title={t("visitSubreddit")}>
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
