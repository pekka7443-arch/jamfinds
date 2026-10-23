/** Shared client-side types mirroring the API + DB rows. */

import type { SourceDef } from "@/lib/sources";

export type { SourceDef };

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
  /** When the same mod exists on several sources: every matching SourceDef (newest row wins the listing slot). */
  sources?: SourceDef[];
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

/* ------------------------------------------------------------------ */
/* Download-link detection (client-safe — no Node deps)                */
/* ------------------------------------------------------------------ */

/**
 * Hosts that actually serve mod files (directly, or behind one click on the
 * host's own page). Posts whose ONLY links point somewhere else — Patreon,
 * Ko-fi, Boosty, YouTube, Discord invites, official sites, link collections —
 * have no real download and must never sit in the download categories
 * (Vehicles/Maps/etc. are "working mods only").
 */
const FILE_HOSTS = new Set([
  "modsfire",
  "mediafire",
  "gdrive",
  "pixeldrain",
  "dropbox",
  "onedrive",
  "workupload",
  "sharemods",
  "mega",
  "beamfinds",
  "beamfree",
]);

/**
 * Real file hosts that classifyUrl reports as "other": Discord CDN
 * attachments (cdn.discordapp.com is not discord.com), Modland and a few
 * common free hosts seen in BeamNG circles. Discord INVITES (discord.gg /
 * discord.com) are deliberately NOT download links — gated content.
 */
const FILE_HOST_URL_RE =
  /https?:\/\/(?:[\w-]+\.)*(?:discordapp\.com\/attachments|modland\.net|gofile\.io|fileditch|ditch\.moe|temp\.sh|catbox\.moe)/i;

export function isDownloadLink(link: { host: string; url: string }): boolean {
  if (FILE_HOSTS.has(link.host)) return true;
  return FILE_HOST_URL_RE.test(link.url);
}

export function hasDownloadLink(links: { host: string; url: string }[]): boolean {
  return links.some(isDownloadLink);
}

export const CATEGORIES: { key: string; label: string }[] = [
  { key: "all", label: "All mods" },
  { key: "vehicle", label: "Vehicles" },
  { key: "map", label: "Maps" },
  { key: "skin", label: "Skins" },
  { key: "parts", label: "Parts & Tuning" },
  { key: "request", label: "Requests" },
  { key: "info", label: "Info" },
  { key: "other", label: "Other" },
  { key: "no-link", label: "No download" },
  // Client-side pseudo-category: filters the loaded set by the device's
  // saved (starred) mods. The API maps cat=saved to the same query as "all".
  { key: "saved", label: "Saved" },
];

/**
 * Category color system — one badge-tint recipe (globals.css) with
 * well-separated hues sharing identical lightness/chroma/border-alpha,
 * so chips stay distinguishable but read as one family. No hue falls in
 * the green band (oklch 100–170). Shared by filter chips and card badges.
 */
export const CATEGORY_STYLES: Record<string, string> = {
  all: "badge-tint cat-brand",
  vehicle: "badge-tint cat-vehicle",
  map: "badge-tint cat-map",
  skin: "badge-tint cat-skin",
  parts: "badge-tint cat-parts",
  request: "badge-tint cat-request",
  info: "badge-tint cat-info",
  other: "badge-tint cat-other",
  "no-link": "badge-tint cat-nolink",
  saved: "badge-tint cat-brand",
};
