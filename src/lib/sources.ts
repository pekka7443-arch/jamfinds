/**
 * Source registry — every place JamFinds watches for mods.
 *
 * Two kinds of sources:
 *  - "reddit": subreddit /new/.rss feeds (handled by src/lib/reddit.ts)
 *  - "web":    scraped sites (handled by src/lib/scrapers.ts)
 *
 * Add an entry here and the sync engine picks it up automatically.
 */

export type SourceKind = "reddit" | "web";

export interface SourceDef {
  /** Canonical source key stored in the DB `source` column. */
  key: string;
  kind: SourceKind;
  /** Human-facing label shown in UI. */
  label: string;
  /** Public URL of the source (used for "open source" links). */
  url: string;
  /** Tailwind classes for the colored dot + chip accent in the UI. */
  dot: string;
  chip: string;
}

export const SOURCE_DEFS: SourceDef[] = [
  {
    key: "Beamng_Jamaica",
    kind: "reddit",
    label: "r/Beamng_Jamaica",
    url: "https://www.reddit.com/r/Beamng_Jamaica/",
    dot: "bg-emerald-400",
    chip: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
  },
  {
    key: "BeamNGpiratemods",
    kind: "reddit",
    label: "r/BeamNGpiratemods",
    url: "https://www.reddit.com/r/BeamNGpiratemods/",
    dot: "bg-orange-400",
    chip: "border-orange-500/35 bg-orange-500/10 text-orange-300",
  },
  {
    key: "beamng_leakedmods",
    kind: "reddit",
    label: "r/beamng_leakedmods",
    url: "https://www.reddit.com/r/beamng_leakedmods/",
    dot: "bg-rose-400",
    chip: "border-rose-500/35 bg-rose-500/10 text-rose-300",
  },
  {
    key: "BeamNG_Leaked_M0ds",
    kind: "reddit",
    label: "r/BeamNG_Leaked_M0ds",
    url: "https://www.reddit.com/r/BeamNG_Leaked_M0ds/",
    dot: "bg-fuchsia-400",
    chip: "border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-300",
  },
  {
    key: "BeamFinds",
    kind: "web",
    label: "BeamFinds",
    url: "https://beamfinds.com/",
    dot: "bg-cyan-400",
    chip: "border-cyan-500/35 bg-cyan-500/10 text-cyan-300",
  },
  {
    key: "BeamFree",
    kind: "web",
    label: "BeamFree",
    url: "https://beamfree.pro/",
    dot: "bg-violet-400",
    chip: "border-violet-500/35 bg-violet-500/10 text-violet-300",
  },
];

/** Flat list of source keys (order matters for sync pacing). */
export const SOURCES: string[] = SOURCE_DEFS.map((s) => s.key);

export function sourceDef(key: string): SourceDef | undefined {
  return SOURCE_DEFS.find((s) => s.key.toLowerCase() === key.toLowerCase());
}

/** UI fallback for unknown sources (defensive). */
export function sourceDot(key: string): string {
  return sourceDef(key)?.dot ?? "bg-zinc-400";
}
