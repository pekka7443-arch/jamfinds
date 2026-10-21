/** Shared client-side types mirroring the API + DB rows. */

export interface ModLink {
  url: string;
  host: string;
  label: string;
  decoded: boolean;
}

export interface ModItem {
  id: string;
  source: string;
  title: string;
  rawTitle: string;
  author: string;
  permalink: string;
  text: string;
  thumbnail: string | null;
  images: string; // JSON array string
  links: string; // JSON array string
  category: string;
  hasLinks: boolean;
  publishedAt: string; // ISO
  firstSeenAt: string; // ISO
}

export interface SyncInfo {
  lastSyncAt: string | null;
  lastResult: string | null;
  lastError: string | null;
  syncCount: number;
}

export interface ModsResponse {
  mods: ModItem[];
  total: number;
  page: number;
  hasMore: boolean;
  stats: {
    total: number;
    fresh24h: number;
    withLinks: number;
    sources: { name: string; count: number }[];
  };
  sources: string[];
  sync: SyncInfo;
  serverNow: string;
}

export function parseLinks(mod: ModItem): ModLink[] {
  try {
    const arr = JSON.parse(mod.links) as ModLink[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function parseImages(mod: ModItem): string[] {
  try {
    const arr = JSON.parse(mod.images) as string[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Client-safe constants shared by UI and server                       */
/* ------------------------------------------------------------------ */

export interface HostStyle {
  label: string;
  className: string;
}

/* One cohesive badge recipe: 35% border, 12% fill, 300-level text. */
export const HOST_STYLES: Record<string, HostStyle> = {
  modsfire: { label: "Modsfire", className: "border-amber-500/35 bg-amber-500/12 text-amber-300" },
  mediafire: { label: "Mediafire", className: "border-sky-500/35 bg-sky-500/12 text-sky-300" },
  gdrive: { label: "Google Drive", className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-300" },
  discord: { label: "Discord", className: "border-violet-500/35 bg-violet-500/12 text-violet-300" },
  mega: { label: "MEGA", className: "border-rose-500/35 bg-rose-500/12 text-rose-300" },
  workupload: { label: "Workupload", className: "border-teal-500/35 bg-teal-500/12 text-teal-300" },
  sharemods: { label: "ShareMods", className: "border-lime-500/35 bg-lime-500/12 text-lime-300" },
  pixeldrain: { label: "Pixeldrain", className: "border-cyan-500/35 bg-cyan-500/12 text-cyan-300" },
  onedrive: { label: "OneDrive", className: "border-orange-500/35 bg-orange-500/12 text-orange-300" },
  dropbox: { label: "Dropbox", className: "border-orange-500/35 bg-orange-500/12 text-orange-300" },
  beamfinds: { label: "BeamFinds", className: "border-cyan-500/35 bg-cyan-500/12 text-cyan-300" },
  beamfree: { label: "BeamFree", className: "border-violet-500/35 bg-violet-500/12 text-violet-300" },
  other: { label: "Link", className: "border-zinc-500/35 bg-zinc-500/12 text-zinc-300" },
};

export function hostStyle(host: string): HostStyle {
  return HOST_STYLES[host] ?? HOST_STYLES.other;
}

export const CATEGORIES: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "vehicle", label: "Vehicles" },
  { key: "map", label: "Maps" },
  { key: "skin", label: "Skins" },
  { key: "parts", label: "Parts & Tuning" },
  { key: "request", label: "Requests" },
  { key: "info", label: "Info" },
  { key: "other", label: "Other" },
];

/**
 * Category color system — one recipe (35% border, 12% fill, 300-level text)
 * with seven well-separated hues so chips stay distinguishable but harmonious.
 * Shared by filter chips and card badges.
 */
export const CATEGORY_STYLES: Record<string, string> = {
  all: "border-emerald-500/35 bg-emerald-500/12 text-emerald-300",
  vehicle: "border-emerald-500/35 bg-emerald-500/12 text-emerald-300",
  map: "border-teal-500/35 bg-teal-500/12 text-teal-300",
  skin: "border-fuchsia-500/35 bg-fuchsia-500/12 text-fuchsia-300",
  parts: "border-amber-500/35 bg-amber-500/12 text-amber-300",
  request: "border-rose-500/35 bg-rose-500/12 text-rose-300",
  info: "border-sky-500/35 bg-sky-500/12 text-sky-300",
  other: "border-zinc-500/35 bg-zinc-500/12 text-zinc-300",
};
