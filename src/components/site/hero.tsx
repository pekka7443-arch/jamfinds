"use client";

import { Car, Unlock, Clock3, Database } from "lucide-react";
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
  return (
    <section className="hero-bg border-b border-border">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-6">
        <div className="flex flex-col items-start gap-3">
          <span className="rise-in inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
            🇯🇲 BeamNG.drive · live multi-source hub
          </span>
          <h1 className="tt-display rise-in rise-in-1 max-w-3xl">
            Every BeamNG mod drop,
            <br className="hidden sm:block" /> <span className="text-gradient-jam">the second it lands.</span>
          </h1>
          <p className="tt-body rise-in rise-in-2 max-w-2xl text-muted-foreground">
            JamFinds watches four subreddits and two mod sites around the clock — r/Beamng_Jamaica,
            r/BeamNGpiratemods, r/beamng_leakedmods, r/BeamNG_Leaked_M0ds, BeamFinds and BeamFree — and pulls each
            new release the moment it appears. Base64 mod codes from Reddit are decoded automatically: no decoder
            sites, no hunting.
          </p>
        </div>

        <div className="rise-in rise-in-3 mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<Database className="h-3.5 w-3.5 text-primary" />}
            label="Mods indexed"
            value={isLoading ? "…" : data?.stats.total ?? 0}
            hint={`from ${data?.stats.sources.length ?? 0} source${(data?.stats.sources.length ?? 0) === 1 ? "" : "s"}`}
            accent="bg-primary/15"
          />
          <StatCard
            icon={<Clock3 className="h-3.5 w-3.5 text-gold" />}
            label="New in 24h"
            value={isLoading ? "…" : data?.stats.fresh24h ?? 0}
            hint="published in the last day"
            accent="bg-gold/15"
          />
          <StatCard
            icon={<Unlock className="h-3.5 w-3.5 text-primary" />}
            label="Ready to download"
            value={isLoading ? "…" : data?.stats.withLinks ?? 0}
            hint="links found & decoded"
            accent="bg-primary/15"
          />
          <StatCard
            icon={<Car className="h-3.5 w-3.5 text-gold" />}
            label="Last sync"
            value={data?.sync.lastSyncAt ? <RelativeTime iso={data.sync.lastSyncAt} /> : isLoading ? "…" : "—"}
            hint={`across ${SOURCE_DEFS.length} sources, every minute`}
            accent="bg-gold/15"
          />
        </div>
      </div>
    </section>
  );
}
