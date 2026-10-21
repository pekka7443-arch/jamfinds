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

/* One badge-tint recipe (globals.css): identical L/C/border-alpha per badge,
 * only the hue class differs — badges stay in one harmonious family. */
export const HOST_STYLES: Record<string, HostStyle> = {
  modsfire: { label: "Modsfire", className: "badge-tint host-modsfire" },
  mediafire: { label: "Mediafire", className: "badge-tint host-mediafire" },
  gdrive: { label: "Google Drive", className: "badge-tint host-gdrive" },
  discord: { label: "Discord", className: "badge-tint host-discord" },
  mega: { label: "MEGA", className: "badge-tint host-mega" },
  workupload: { label: "Workupload", className: "badge-tint host-workupload" },
  sharemods: { label: "ShareMods", className: "badge-tint host-sharemods" },
  pixeldrain: { label: "Pixeldrain", className: "badge-tint host-pixeldrain" },
  onedrive: { label: "OneDrive", className: "badge-tint host-onedrive" },
  dropbox: { label: "Dropbox", className: "badge-tint host-dropbox" },
  beamfinds: { label: "BeamFinds", className: "badge-tint host-beamfinds" },
  beamfree: { label: "BeamFree", className: "badge-tint host-beamfree" },
  other: { label: "Link", className: "badge-tint host-other" },
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
 * Category color system — one badge-tint recipe (globals.css) with seven
 * well-separated hues sharing identical lightness/chroma/border-alpha,
 * so chips stay distinguishable but read as one family.
 * Shared by filter chips and card badges.
 */
export const CATEGORY_STYLES: Record<string, string> = {
  all: "badge-tint cat-vehicle",
  vehicle: "badge-tint cat-vehicle",
  map: "badge-tint cat-map",
  skin: "badge-tint cat-skin",
  parts: "badge-tint cat-parts",
  request: "badge-tint cat-request",
  info: "badge-tint cat-info",
  other: "badge-tint cat-other",
};
