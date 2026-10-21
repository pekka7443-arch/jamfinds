"use client";

import { Car, Unlock, Clock3, Database } from "lucide-react";
import type { ModsResponse } from "@/lib/types";
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
    <div className="rounded-xl border border-border bg-card/70 p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${accent}`} aria-hidden="true">
          {icon}
        </span>
        {label}
      </div>
      <div className="font-[family-name:var(--font-display)] text-2xl leading-7 text-foreground">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function Hero({ data, isLoading }: HeroProps) {
  return (
    <section className="hero-bg border-b border-border/60">
      <div className="mx-auto max-w-7xl px-4 pt-10 pb-8">
        <div className="flex flex-col items-start gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
            🇯🇲 BeamNG.drive · Jamaica mod hub
          </span>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl md:text-5xl leading-tight tracking-tight">
            Find Jamaican <span className="text-gradient-jam">BeamNG mods</span>
            <br className="hidden sm:block" /> the second they drop.
          </h1>
          <p className="max-w-2xl text-sm sm:text-base text-muted-foreground">
            JamFinds watches r/Beamng_Jamaica around the clock, pulls every new release the
            moment it&apos;s posted, and automatically decodes the base64 mod links for you — no decoder sites, no
            hunting. Fresh finds appear here in about a minute.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<Database className="h-3.5 w-3.5 text-emerald-400" />}
            label="Mods indexed"
            value={isLoading ? "…" : data?.stats.total ?? 0}
            hint={`from ${data?.stats.sources.length ?? 0} subreddit${(data?.stats.sources.length ?? 0) === 1 ? "" : "s"}`}
            accent="bg-emerald-500/15"
          />
          <StatCard
            icon={<Clock3 className="h-3.5 w-3.5 text-gold" />}
            label="New on Reddit (24h)"
            value={isLoading ? "…" : data?.stats.fresh24h ?? 0}
            hint="posts published in the last day"
            accent="bg-gold/15"
          />
          <StatCard
            icon={<Unlock className="h-3.5 w-3.5 text-amber-400" />}
            label="Ready to download"
            value={isLoading ? "…" : data?.stats.withLinks ?? 0}
            hint="decoded links included"
            accent="bg-amber-500/15"
          />
          <StatCard
            icon={<Car className="h-3.5 w-3.5 text-emerald-400" />}
            label="Last sync"
            value={data?.sync.lastSyncAt ? <RelativeTime iso={data.sync.lastSyncAt} /> : isLoading ? "…" : "—"}
            hint="auto-refreshes every minute"
            accent="bg-emerald-500/15"
          />
        </div>
      </div>
    </section>
  );
}
