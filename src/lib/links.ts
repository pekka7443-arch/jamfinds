/**
 * Link extraction + classification for r/Beamng_Jamaica style posts.
 *
 * The subreddit shares mods as:
 *  1. Plain URLs (modsfire.com, mediafire.com, drive.google.com ...)
 *  2. Base64-encoded URLs (e.g. aHR0cHM6Ly9tb2RzZmlyZS5jb20vQjYyOTRpNDREcTJHZjRo)
 *     pasted in the title or the post body.
 * This module finds both kinds and decodes them automatically.
 */

import { CATEGORIES, HOST_STYLES, hostStyle } from "@/lib/types"

export { CATEGORIES, HOST_STYLES, hostStyle }

export interface ExtractedLink {
  url: string
  host: string // canonical host key, e.g. "modsfire"
  label: string // pretty label, e.g. "Modsfire"
  decoded: boolean // true when it came from a base64 code
}

export function classifyUrl(url: string): { host: string; label: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { host: "other", label: "Link" }
  }
  const h = parsed.hostname.replace(/^www\./, "").toLowerCase()

  if (h.endsWith("modsfire.com")) return { host: "modsfire", label: "Modsfire" }
  if (h.endsWith("mediafire.com")) return { host: "mediafire", label: "Mediafire" }
  if (h.endsWith("drive.google.com") || h.endsWith("docs.google.com")) return { host: "gdrive", label: "Google Drive" }
  if (h.endsWith("discord.gg") || h.endsWith("discord.com")) return { host: "discord", label: "Discord" }
  if (h.endsWith("mega.nz") || h.endsWith("mega.io")) return { host: "mega", label: "MEGA" }
  if (h.endsWith("workupload.com")) return { host: "workupload", label: "Workupload" }
  if (h.endsWith("sharemods.com")) return { host: "sharemods", label: "ShareMods" }
  if (h.endsWith("pixeldrain.com")) return { host: "pixeldrain", label: "Pixeldrain" }
  if (h.endsWith("onedrive.live.com") || h.endsWith("1drv.ms")) return { host: "onedrive", label: "OneDrive" }
  if (h.endsWith("dropbox.com")) return { host: "dropbox", label: "Dropbox" }
  if (h === "beamfinds.com" || h.endsWith(".beamfinds.com")) return { host: "beamfinds", label: "BeamFinds" }
  if (h === "beamfree.pro" || h.endsWith(".beamfree.pro")) return { host: "beamfree", label: "BeamFree" }
  return { host: "other", label: "Link" }
}

/** Regex for plausible base64 tokens (>=16 chars) not glued to other words. */
const B64_RE = /(?<![A-Za-z0-9+/=])([A-Za-z0-9+/]{16,}={0,2})(?![A-Za-z0-9+/=])/g

/** Regex for plain URLs in text. */
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

/** Try to decode a base64 token; return it only if it hides a URL. */
function tryDecodeB64(token: string): string | null {
  // Cheap pre-filter: lots of base64 URL encodings start with the https prefix.
  const maybe = token.length % 4 === 0 || token.endsWith("=")
  if (!maybe) return null
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8")
    // Reject strings with weird control chars — real URLs are printable ASCII.
    if (!/^https?:\/\/[\x21-\x7e]+$/.test(decoded)) return null
    return decoded
  } catch {
    return null
  }
}

/**
 * Extract all download links (plain + base64-decoded) from a piece of text.
 * Deduplicated by URL, plain links first.
 */
export function extractLinks(...texts: (string | null | undefined)[]): ExtractedLink[] {
  const joined = texts.filter(Boolean).join("\n")
  if (!joined) return []

  const found = new Map<string, ExtractedLink>()

  // 1. Plain URLs (some posts glue two URLs together — split them apart)
  for (const match of joined.matchAll(URL_RE)) {
    for (const raw of match[0].split(/(?=https?:\/\/)/)) {
      const url = raw.replace(/[.,;]+$/, "")
      const { host, label } = classifyUrl(url)
      if (!found.has(url)) found.set(url, { url, host, label, decoded: false })
    }
  }

  // 2. Base64-encoded URLs
  for (const match of joined.matchAll(B64_RE)) {
    const decoded = tryDecodeB64(match[1])
    if (decoded) {
      const { host, label } = classifyUrl(decoded)
      if (!found.has(decoded)) found.set(decoded, { url: decoded, host, label, decoded: true })
    }
  }

  return [...found.values()]
}

/** Strip base64 tokens that decoded to URLs from a title, for clean display. */
export function cleanTitle(title: string): string {
  const codes: string[] = []
  for (const m of title.matchAll(B64_RE)) {
    if (tryDecodeB64(m[1])) codes.push(m[1])
  }
  let out = title
  for (const c of codes) {
    out = out.replace(c, "")
  }
  return out.replace(/\s{2,}/g, " ").trim()
}

/* ------------------------------------------------------------------ */
/* Category inference                                                  */
/* ------------------------------------------------------------------ */

const VEHICLE_RE =
  /\b(bmw|toyota|porsche|lamborghini|ferrari|audi|nissan|mazda|subaru|honda|ford|chevrolet|corvette|mustang|dodge|jeep|mercedes|benz|volkswagen|\bvw\b|kia|hyundai|tesla|mclaren|bugatti|koenig|pagani|lexus|acura|infiniti|mitsubishi|suzuki|range rover|land rover|rolls-royce|bentley|aston martin|jaguar|alfa romeo|fiat|peugeot|renault|citroen|opel|vauxhall|seat|skoda|volvo|saab|cadillac|lincoln|chrysler|gmc|ram|shelby|hennessey|rtr|car|truck|bus|wagon|coupe|sedan|jdm|drift|gt3|gt-r|supra|skyline|silvia|civic|integra|chaser|mark|altezza|e46|e36|e39|e60|e92|f80|f82|g82|m3|m4|m5|911|cayman|boxster|gallardo|huracan|aventador|chiron|jesko|agera|giulia|stinger|charger|challenger|hellcat|camaro|corolla|ae86|prelude|nsx|rx-?7|rx-?8|s2000|350z|370z|gtr|evo|lancer|wrx|sti|brz|frs|gt86|kei|pickup|hilux|tacoma|f-?150|silverado|sierra|tundra|atv|quad|bike|motorcycle|ute|estate|touring|crossover|suv|van|semitruck|semi)\b/i

const MAP_RE = /\b(\bmap\b|maps|terrain|\btrack\b|\bcity\b|island|jamaica map|location|world|environment)\b/i
const SKIN_RE = /\b(skin|skins|livery|liveries|paint ?job|\bwrap\b|decals?|texture ?pack|reskin)\b/i
const PARTS_RE =
  /\b(engine|turbo|wheels?|\btyres?\b|\btires?\b|suspension|exhaust|swap|parts|rims?|bodykit|body kit|spoiler| Tuning |modular|steering wheel|cupholder|fps|booster|pack v)\b/i
const REQUEST_RE =
  /\b(request|requests|\bneed(ed)?\b|\bplz\b|\bpls\b|please|missing|\bhelp\b)\b/i

/**
 * Unambiguous request phrasings — these mark a post as a request even when it
 * contains a link (e.g. a Discord invite). Release posts essentially never
 * start with these, so they are safe to check before any content category.
 */
const STRONG_REQUEST_RE =
  /\b(anyone (have|has|got|know|get)|anybody (have|has|got|know)|who (has|got|have)|looking for|does any(one|body)|can (some|any)one|can u( please)?|where (can|do|did|is|to)|help me find|mod request|\brequests?\b|\blf\b|\blft\b|send (me|it|link)|dm me|drop (the )?link|link (pls|plz|please)|willing to pay|is there (a|any|the))\b/i
const INFO_RE =
  /\b(discord|how to|guide|tutorial|\brules\b|welcome|\bpsa\b|announcement|announcement|info|information|read (this|first)|base ?64)\b/i

/**
 * Infer a coarse category from title + body text.
 *
 * Requests are detected FIRST and win over everything: the main grid shows
 * downloadable mods only, and request posts must land in the Requests
 * section — never among Vehicles/Maps/etc.
 */
export function inferCategory(title: string, text: string, hasLinks: boolean): string {
  const hay = `${title}\n${text}`

  // Strong request phrasings — unambiguous, links or not.
  if (STRONG_REQUEST_RE.test(hay)) return "request"
  // A linkless title that asks a question is a request/discussion, not a mod.
  if (!hasLinks && /\?\s*$/.test(title.trim())) return "request"
  // Weak request words — only trusted when the post has no download links
  // (release posts can legitimately contain "need BeamNG 0.31+", "please read"...).
  if (REQUEST_RE.test(hay) && !hasLinks) return "request"

  if (INFO_RE.test(hay) && !hasLinks) return "info"
  if (MAP_RE.test(title) || MAP_RE.test(text.slice(0, 400))) return "map"
  if (SKIN_RE.test(hay)) return "skin"
  if (PARTS_RE.test(title)) return "parts"
  if (VEHICLE_RE.test(hay) || hasLinks) return "vehicle"
  return "other"
}
