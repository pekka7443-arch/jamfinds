/**
 * Web scrapers for non-Reddit mod sources.
 *
 *  - BeamFinds (beamfinds.com): public JSON API at /api/public/v1/mods
 *    returns { data: [{id, name, author, thumbnail, downloads, rating, uploaded_at}] }.
 *    Thumbnails are served from https://cdn.beamfinds.com/{thumbnail}.
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
/* BeamFinds (public JSON API)                                         */
/* ------------------------------------------------------------------ */

interface BfMod {
  id: number
  name: string
  author: string
  thumbnail: string | null
  downloads: number
  rating: string | null
  uploaded_at: string
}

/**
 * Fetch the newest BeamFinds mods. The API ignores `limit` and returns ~20
 * rows per page, newest first, so we pull the first two pages (≈40 mods).
 */
export async function fetchBeamfinds(pages = 2): Promise<NormalizedEntry[]> {
  const out: NormalizedEntry[] = []
  for (let p = 1; p <= pages; p++) {
    // curl first (their CDN rejects Node's TLS fingerprint with 403s),
    // native fetch as fallback if curl is unavailable.
    let body: string
    try {
      body = await curlGet(`https://beamfinds.com/api/public/v1/mods?page=${p}`, "application/json")
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
