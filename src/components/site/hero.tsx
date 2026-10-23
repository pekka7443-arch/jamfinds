"use client";

import { Car, Unlock, Clock3, Database, Radio } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModsResponse } from "@/lib/types";
import { SOURCE_DEFS } from "@/lib/sources";
import { RelativeTime } from "./relative-time";

interface HeroProps {
  data: ModsResponse | undefined;
  isLoading: boolean;
}

function StatCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="surface-card flex flex-col gap-1 rounded-xl bg-card/70 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${accent}`} aria-hidden="true">
          {icon}
        </span>
        <span className="leading-tight">{label}</span>
      </div>
      <div className="font-[family-name:var(--font-display)] text-[1.375rem] leading-7 text-foreground sm:text-2xl">
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function Hero({ data, isLoading }: HeroProps) {
  const t = useTranslations("hero");
  const sources = data?.stats.sources.length ?? 0;

  return (
    <section className="hero-bg border-b border-border">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-6">
        <div className="flex flex-col items-start gap-3">
          <span className="rise-in inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Radio className="h-3 w-3" aria-hidden="true" />
            {t("badge")}
          </span>
          <h1 className="tt-display rise-in rise-in-1 max-w-3xl">
            {t("title1")}
            <br className="hidden sm:block" /> <span className="text-gradient-brand">{t("title2")}</span>
          </h1>
          <p className="tt-body rise-in rise-in-2 max-w-2xl text-muted-foreground">{t("body")}</p>
        </div>

        <div className="rise-in rise-in-3 mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<Database className="h-3.5 w-3.5 text-primary" />}
            label={t("statMods")}
            value={isLoading ? "…" : data?.stats.total ?? 0}
            hint={t("statModsHint", { count: sources })}
            accent="bg-primary/15"
          />
          <StatCard
            icon={<Clock3 className="h-3.5 w-3.5 text-primary" />}
            label={t("statNew")}
            value={isLoading ? "…" : data?.stats.fresh24h ?? 0}
            hint={t("statNewHint")}
            accent="bg-primary/15"
          />
          <StatCard
            icon={<Unlock className="h-3.5 w-3.5 text-primary" />}
            label={t("statReady")}
            value={isLoading ? "…" : data?.stats.withLinks ?? 0}
            hint={t("statReadyHint")}
            accent="bg-primary/15"
          />
          <StatCard
            icon={<Car className="h-3.5 w-3.5 text-primary" />}
            label={t("statLastSync")}
            value={data?.sync.lastSyncAt ? <RelativeTime iso={data.sync.lastSyncAt} /> : isLoading ? "…" : "—"}
            hint={t("statLastSyncHint", { count: SOURCE_DEFS.length })}
            accent="bg-primary/15"
          />
        </div>
      </div>
    </section>
  );
}
