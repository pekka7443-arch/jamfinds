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

export const HOST_STYLES: Record<string, HostStyle> = {
  modsfire: { label: "Modsfire", className: "bg-amber-400/15 text-amber-300 border-amber-400/30" },
  mediafire: { label: "Mediafire", className: "bg-sky-400/15 text-sky-300 border-sky-400/30" },
  gdrive: { label: "Google Drive", className: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30" },
  discord: { label: "Discord", className: "bg-violet-400/15 text-violet-300 border-violet-400/30" },
  mega: { label: "MEGA", className: "bg-rose-400/15 text-rose-300 border-rose-400/30" },
  workupload: { label: "Workupload", className: "bg-teal-400/15 text-teal-300 border-teal-400/30" },
  sharemods: { label: "ShareMods", className: "bg-lime-400/15 text-lime-300 border-lime-400/30" },
  pixeldrain: { label: "Pixeldrain", className: "bg-cyan-400/15 text-cyan-300 border-cyan-400/30" },
  onedrive: { label: "OneDrive", className: "bg-orange-400/15 text-orange-300 border-orange-400/30" },
  dropbox: { label: "Dropbox", className: "bg-orange-400/15 text-orange-300 border-orange-400/30" },
  other: { label: "Link", className: "bg-zinc-400/15 text-zinc-300 border-zinc-400/30" },
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
