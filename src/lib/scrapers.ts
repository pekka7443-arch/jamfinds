/**
 * Web scrapers for non-Reddit mod sources.
 *
 *  - BeamFinds (beamfinds.com): the site's own app POSTs to /api/mods/list
 *    {page, limit, category, sort} (axios baseURL "/api") — that endpoint is
 *    the only one that actually filters by category (the public GET
 *    /api/public/v1/mods ignores it) and returns rich metadata (description,
 *    tags, file_size, images, downloads, ratings). Category vocabulary:
 *    "IRL Vehicle", "Fictional Vehicle", "Map", "Parts", "Config",
 *    "Sound Mod", "UI", "Other" + legacy lowercase "vehicles".
 *    Thumbnails/images are served from https://cdn.beamfinds.com/{path}.
 *
 *  - BeamFree (beamfree.pro): server-rendered homepage with <a class="card" href="/mod/N">
 *    blocks containing .cimg/.ctitle/.ccreator/.ccat/.cstats markup.
 *
 * Both return the same NormalizedEntry shape the sync engine upserts.
 */

import { execFile } from "node:child_process";
import { inferCategory } from "@/lib/links";
import type { ExtractedLink } from "@/lib/links";

export interface NormalizedEntry {
  id: string // globally unique, e.g. "bf-834" or "t3_xxx"
  source: string // SourceDef.key
  title: string
  author: string
  permalink: string
  publishedAt: Date
  text: string
  thumbnail: string | null
  images: string[]
  /** Pre-extracted links; when empty the sync engine falls back to text extraction. */
  links: ExtractedLink[]
  /** Category directly from the source (e.g. BeamFree "Map") — beats inference. */
  catHint?: string
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

async function get(url: string, accept: string, timeoutMs = 15_000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en-US,en;q=0.9" },
      signal: controller.signal,
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch via the curl binary. Node's TLS fingerprint is rejected by some
 * CDNs (beamfinds.com answered 403 to undici while curl passed), so curl
 * is the resilient path for those hosts.
 */
function curlGet(url: string, accept: string, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-s",
      "--http1.1",
      "--max-time",
      String(Math.ceil(timeoutMs / 1000)),
      "-w",
      "\n%{http_code}",
      "-A",
      UA,
      "-H",
      `Accept: ${accept}`,
      "-H",
      "Accept-Language: en-US,en;q=0.9",
      url,
    ]
    execFile("curl", args, { timeout: timeoutMs + 2_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (!stdout) return reject(new Error(err?.message ?? "curl returned nothing"))
      const idx = stdout.lastIndexOf("\n")
      const body = idx >= 0 ? stdout.slice(0, idx) : stdout
      const status = Number(idx >= 0 ? stdout.slice(idx + 1).trim() : "0") || 0
      if (status === 0) return reject(new Error("curl could not connect"))
      if (status >= 400) return reject(new Error(`HTTP ${status} (curl) for ${url}`))
      resolve(body)
    })
  })
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&")
}

/* ------------------------------------------------------------------ */
/* BeamFinds (POST /api/mods/list — the real, category-aware endpoint)  */
/* ------------------------------------------------------------------ */

/** Every BeamFinds category, incl. the legacy lowercase "vehicles" bucket. */
export const BF_CATEGORIES = [
  "IRL Vehicle",
  "Fictional Vehicle",
  "Map",
  "Parts",
  "Config",
  "Sound Mod",
  "UI",
  "Other",
  "vehicles",
] as const;

interface BfModFull {
  id: number;
  name: string;
  author: string;
  description?: string | null;
  category?: string | null;
  file_size?: string | number | null;
  thumbnail?: string | null;
  game_version?: string | null;
  uploaded_at?: string;
  downloads?: number;
  total_rating?: string | number | null;
  rating_count?: number;
  avg_rating?: string | number | null;
  /** JSON string or already-parsed array of CDN paths. */
  images?: unknown;
}

/** Old public GET API shape (kept as fallback). */
interface BfMod {
  id: number;
  name: string;
  author: string;
  thumbnail: string | null;
  downloads: number;
  rating: string | null;
  uploaded_at: string;
}

interface BfListResponse {
  success?: boolean;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  mods?: BfModFull[];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * POST via the curl binary. Node's TLS fingerprint is rejected by their CDN
 * (403 to undici while curl passes), so curl is the primary path for BeamFinds.
 */
function curlPostJson(url: string, payload: unknown, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-s",
      "--http1.1",
      "--max-time",
      String(Math.ceil(timeoutMs / 1000)),
      "-w",
      "\n%{http_code}",
      "-X",
      "POST",
      "-H",
      "Content-Type: application/json",
      "-H",
      "Accept: application/json",
      "-H",
      "Accept-Language: en-US,en;q=0.9",
      "-A",
      UA,
      "--data",
      JSON.stringify(payload),
      url,
    ];
    execFile("curl", args, { timeout: timeoutMs + 2_000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      if (!stdout) return reject(new Error(err?.message ?? "curl returned nothing"));
      const idx = stdout.lastIndexOf("\n");
      const body = idx >= 0 ? stdout.slice(0, idx) : stdout;
      const status = Number(idx >= 0 ? stdout.slice(idx + 1).trim() : "0") || 0;
      if (status === 0) return reject(new Error("curl could not connect"));
      if (status >= 400) return reject(new Error(`HTTP ${status} (curl) for ${url}`));
      resolve(body);
    });
  });
}

/** Native fetch POST fallback (same shape as `get`). */
async function postJson(url: string, payload: unknown, timeoutMs = 15_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** One page of BeamFinds' own /mods/list endpoint (category-aware). */
async function bfModsList(
  category: string | null,
  page: number,
  limit = 50,
): Promise<BfListResponse> {
  const payload: Record<string, unknown> = { page, limit, sort: "newest" };
  if (category) payload.category = category;
  let body: string;
  try {
    body = await curlPostJson("https://beamfinds.com/api/mods/list", payload);
  } catch (curlErr) {
    try {
      body = await postJson("https://beamfinds.com/api/mods/list", payload);
    } catch {
      throw curlErr; // surface the more-informative curl error
    }
  }
  try {
    return JSON.parse(body) as BfListResponse;
  } catch {
    throw new Error(
      `BeamFinds /mods/list returned invalid JSON (category=${category ?? "all"}, page ${page})`,
    );
  }
}

/** Parse the `images` field — a JSON string in API responses, defensively. */
function bfImages(raw: unknown): string[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => `https://cdn.beamfinds.com/${s.replace(/^\/+/, "")}`);
}

/** Map one /mods/list row to a NormalizedEntry. */
function bfEntry(m: BfModFull): NormalizedEntry | null {
  const title = (m.name ?? "").trim();
  if (!title || !m.id) return null;
  const cdn = (p: string) => `https://cdn.beamfinds.com/${String(p).replace(/^\/+/, "")}`;
  const images = bfImages(m.images);
  const thumb = m.thumbnail ? cdn(m.thumbnail) : (images[0] ?? null);
  // Rich text preview: real description + one stats line.
  const stats = [
    m.file_size ? String(m.file_size) : "",
    m.game_version ? `BeamNG ${m.game_version}` : "",
    m.downloads ? `${m.downloads} downloads` : "",
    m.rating_count
      ? `rated ${m.avg_rating ?? m.total_rating ?? "?"}/5 (${m.rating_count})`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const desc = (m.description ?? "").trim();
  const text = [desc, stats].filter(Boolean).join("\n\n");
  // Detail pages live at /mod/{id} (singular) — /mods/{id} 404s.
  const permalink = `https://beamfinds.com/mod/${m.id}`;
  const links: ExtractedLink[] = [
    { url: permalink, host: "beamfinds", label: "BeamFinds", decoded: false },
  ];
  return {
    id: `bf-${m.id}`,
    source: "BeamFinds",
    title,
    author: (m.author ?? "BeamFinds").trim() || "BeamFinds",
    permalink,
    publishedAt: m.uploaded_at ? new Date(m.uploaded_at) : new Date(),
    text,
    thumbnail: thumb,
    images: thumb ? (images.length > 0 ? images : [thumb]) : [],
    links,
    catHint: m.category ?? undefined,
  };
}

/**
 * Total mod count in BeamFinds' catalog (cheap 1-row probe), or null when
 * their API is unreachable. The sync engine compares this against the DB to
 * decide between a full sweep and a quick top-up.
 */
export async function fetchBeamfindsTotal(): Promise<number | null> {
  try {
    const res = await bfModsList(null, 1, 1);
    return typeof res.total === "number" ? res.total : null;
  } catch {
    return null;
  }
}

/**
 * Full catalog sweep: every category (plus an unfiltered pass as a safety
 * net for future/new categories), all pages, deduplicated by id. Used for
 * backfills — ~25 requests, so the sync engine only calls this when the DB
 * is meaningfully behind the remote total.
 */
export async function fetchBeamfindsFull(): Promise<NormalizedEntry[]> {
  const byId = new Map<string, NormalizedEntry>();
  let lastErr: unknown = null;
  for (const cat of [null, ...BF_CATEGORIES] as (string | null)[]) {
    try {
      for (let p = 1; ; p++) {
        const res = await bfModsList(cat, p, 50);
        for (const m of res.mods ?? []) {
          const e = bfEntry(m);
          if (e && !byId.has(e.id)) byId.set(e.id, e);
        }
        const totalPages = typeof res.totalPages === "number" ? res.totalPages : 1;
        if (p >= totalPages || (res.mods ?? []).length === 0) break;
        await sleep(400); // be polite to their API
      }
    } catch (err) {
      lastErr = err; // one flaky category must not kill the whole sweep
    }
    await sleep(350);
  }
  if (byId.size === 0 && lastErr) throw lastErr;
  return [...byId.values()];
}

/**
 * Quick top-up: newest-first unfiltered pages (limit 50/page) — catches new
 * uploads between full sweeps. Falls back to the old public GET API if the
 * POST endpoint ever goes away.
 */
export async function fetchBeamfinds(pages = 2): Promise<NormalizedEntry[]> {
  try {
    const out: NormalizedEntry[] = [];
    for (let p = 1; p <= pages; p++) {
      const res = await bfModsList(null, p, 50);
      for (const m of res.mods ?? []) {
        const e = bfEntry(m);
        if (e) out.push(e);
      }
      const totalPages = typeof res.totalPages === "number" ? res.totalPages : 1;
      if (p >= totalPages || (res.mods ?? []).length === 0) break;
    }
    if (out.length > 0) return out;
  } catch {
    // fall through to the legacy endpoint
  }
  return fetchBeamfindsLegacy(pages);
}

/** Legacy public GET API (no category filtering, ~20 rows/page) — fallback only. */
async function fetchBeamfindsLegacy(pages: number): Promise<NormalizedEntry[]> {
  const out: NormalizedEntry[] = [];
  for (let p = 1; p <= pages; p++) {
    let body: string;
    try {
      body = await curlGet(`https://beamfinds.com/api/public/v1/mods?page=${p}`, "application/json");
    } catch (curlErr) {
      body = await get(`https://beamfinds.com/api/public/v1/mods?page=${p}`, "application/json").catch(
        () => {
          throw curlErr
        },
      )
    }
    let json: { data?: BfMod[] }
    try {
      json = JSON.parse(body) as { data?: BfMod[] }
    } catch {
      throw new Error(`BeamFinds API returned invalid JSON (page ${p})`)
    }
    const rows = json.data ?? []
    for (const m of rows) {
      const title = (m.name ?? "").trim()
      if (!title || !m.id) continue
      const thumb = m.thumbnail ? `https://cdn.beamfinds.com/${m.thumbnail}` : null
      // Detail pages live at /mod/{id} (singular) — /mods/{id} 404s.
      const permalink = `https://beamfinds.com/mod/${m.id}`
      const links: ExtractedLink[] = [
        { url: permalink, host: "beamfinds", label: "BeamFinds", decoded: false },
      ]
      out.push({
        id: `bf-${m.id}`,
        source: "BeamFinds",
        title,
        author: (m.author ?? "BeamFinds").trim(),
        permalink,
        publishedAt: m.uploaded_at ? new Date(m.uploaded_at) : new Date(),
        text: "",
        thumbnail: thumb,
        images: thumb ? [thumb] : [],
        links,
      })
    }
    if (rows.length === 0) break
  }
  return out
}

/* ------------------------------------------------------------------ */
/* BeamFree (server-rendered homepage cards)                           */
/* ------------------------------------------------------------------ */

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s{2,}/g, " ").trim()
}

/** Parse the beamfree.pro homepage into mod entries. */
export async function fetchBeamfree(): Promise<NormalizedEntry[]> {
  const html = await get("https://beamfree.pro/", "text/html")
  const out: NormalizedEntry[] = []
  const seen = new Set<string>()

  const cardRe = /<a class="card" href="\/mod\/(\d+)">([\s\S]*?)<\/a>/g
  for (const match of html.matchAll(cardRe)) {
    const numId = match[1]
    const card = match[2]
    if (seen.has(numId)) continue
    seen.add(numId)

    const title = stripTags(card.match(/<div class="ctitle">([\s\S]*?)<\/div>/)?.[1] ?? "")
    if (!title) continue

    const creatorRaw = card.match(/<div class="ccreator">by <b>([\s\S]*?)<\/b>/)?.[1] ?? ""
    const author = stripTags(creatorRaw) || "BeamFree"

    // Category chip, e.g. "💰 RLS", "🚗 Vehicles" — emoji + label
    const catRaw = stripTags(card.match(/<span class="ccat">([\s\S]*?)<\/span>/)?.[1] ?? "")
    // Source-provided category hint: "🗺️ Map" -> "Map", "🚗 Cars" -> "Cars"...
    const catHint = catRaw.replace(/^[^A-Za-z]*/, "").trim() || undefined
    // Image: /i/{hash}.jpg (fallback /cover/{id} handled by the site itself)
    const img = card.match(/src="(\/i\/[^"]+)"/)?.[1] ?? null
    const thumb = img ? decodeEntities(`https://beamfree.pro${img}`) : `https://beamfree.pro/cover/${numId}`

    // Stats line: size / version / game version → useful text preview
    const stats = [...card.matchAll(/<span class="cs"[^>]*>([\s\S]*?)<\/span>/g)]
      .map((s) => stripTags(s[1]))
      .filter(Boolean)
    const rating =
      stripTags(card.match(/<div class="crate">([\s\S]*?)<\/div>/)?.[1] ?? "")
        .replace(/\s*Rate it\s*/i, "")
        .trim() // "★ ★ ★ ★ ★ 5.0 (1)" or empty when unrated

    const preview = [catRaw, rating ? `Rated ${rating}` : "", stats.join(" · ")]
      .filter(Boolean)
      .join("\n")

    const permalink = `https://beamfree.pro/mod/${numId}`
    const links: ExtractedLink[] = [
      { url: permalink, host: "beamfree", label: "BeamFree", decoded: false },
    ]

    // The listing has no timestamps — the sync engine keeps the first-seen
    // date as publishedAt for these (never bumps it on re-sync).
    out.push({
      id: `free-${numId}`,
      source: "BeamFree",
      title,
      author,
      permalink,
      publishedAt: new Date(),
      text: preview,
      thumbnail: thumb,
      images: [thumb],
      links,
      catHint,
    })
  }

  return out
}

/** Category inference re-exported for the sync engine. */
export { inferCategory }
