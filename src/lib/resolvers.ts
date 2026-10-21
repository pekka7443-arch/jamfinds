/**
 * Server-side direct-download resolver.
 *
 * Goal: let users download files FROM JamFinds instead of being bounced to
 * external file-host pages. For each supported host we resolve the *direct*
 * file URL server-side, then /api/download streams it through this site.
 *
 * Resolution strategies (verified against live links from the DB):
 *  - modsfire.com/{id}      3-step chain: page -> /download/{id}/{token} ->
 *                           /d/{id} (302) -> signed R2 URL. Needs a cookie jar.
 *  - drive.google.com file  https://drive.usercontent.google.com/download?id=
 *                           {id}&export=download&confirm=t  (streams directly,
 *                           serves Content-Disposition: attachment).
 *  - pixeldrain.com/{id}    https://pixeldrain.com/api/file/{id}?download
 *  - mediafire.com          scrape the download page for downloadNNN.mediafire.com
 *  - dropbox.com            force ?dl=1
 *  - cdn.discordapp.com     direct attachment — streamable
 *
 * Everything else (MEGA, BeamFinds, BeamFree, Patreon, Discord invites,
 * Modland...) is IP-bound / JS-gated / not-a-file and falls back to
 * "external": /api/download 307-redirects to the original link, which is
 * exactly the old behaviour.
 *
 * Resolved stream URLs are cached in memory (modsfire signed URLs live 600 s,
 * so we cache 8 min; stable hosts 30 min).
 */

import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export type ResolveResult =
  | { mode: "proxy"; streamUrl: string; filename?: string; ttlMs: number }
  | { mode: "external"; reason: string }

/* ------------------------------------------------------------------ */
/* curl plumbing (Node TLS fingerprints get 403'd by several CDNs)      */
/* ------------------------------------------------------------------ */

interface CurlResult {
  status: number
  headers: string // raw header block
  body: string
}

function curl(args: string[], timeoutMs = 20_000): Promise<CurlResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      ["-i", ...args],
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && (err as Error & { killed?: boolean }).killed) {
          return reject(new Error("curl timeout"))
        }
        if (err && !stdout) return reject(new Error(`curl failed: ${stderr.slice(0, 200)}`))
        // With -i (and possibly -L) stdout = one or more
        // "HTTP/1.1 NNN ... headers ... blank ... body" blocks. The final
        // block holds the real status + body of the last response.
        const chunks = stdout.split(/\r?\n(?=HTTP\/[\d.]+\s+\d{3})/).filter((c) => c.trim())
        const last = chunks[chunks.length - 1] ?? ""
        const sep = last.match(/\r?\n\r?\n/)
        const idx = sep?.index ?? -1
        const head = idx >= 0 ? last.slice(0, idx) : last
        const body = idx >= 0 ? last.slice(idx + sep![0].length) : ""
        const m = head.match(/HTTP\/[\d.]+\s+(\d{3})/)
        resolve({ status: m ? Number(m[1]) : 0, headers: head, body })
      },
    )
  })
}

const baseCurlArgs = (jar: string) => ["-s", "--http1.1", "-A", BROWSER_UA, "-b", jar, "-c", jar]

/** Follow at most these many redirects when scraping pages. */
const FOLLOW = ["--location", "--max-redirs", "4"]

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { at: number; result: ResolveResult }>()

function getCached(url: string): ResolveResult | null {
  const hit = cache.get(url)
  if (!hit) return null
  const ttl = hit.result.mode === "proxy" ? hit.result.ttlMs : 60_000
  if (Date.now() - hit.at > ttl) {
    cache.delete(url)
    return null
  }
  return hit.result
}

function setCached(url: string, result: ResolveResult) {
  if (cache.size > 500) cache.clear()
  cache.set(url, { at: Date.now(), result })
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function basenameFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url)
    // ModsFire d.php?p=<base64 "storage/.../file.zip"> — prefer the payload
    // over the meaningless "d.php" path segment.
    const p = u.searchParams.get("p")
    if (p) {
      const dec = Buffer.from(p, "base64").toString("utf-8")
      const name = dec.split("/").pop()
      if (name && /\.[a-z0-9]{2,5}$/i.test(name)) return name
    }
    const last = u.pathname.split("/").filter(Boolean).pop()
    if (last && /\.[a-z0-9]{2,5}$/i.test(decodeURIComponent(last)) && !/\.php$/i.test(last)) {
      return decodeURIComponent(last)
    }
  } catch {
    /* ignore */
  }
  return undefined
}

function firstMatch(re: RegExp, text: string): string | null {
  const m = text.match(re)
  return m?.[1] ?? null
}

/* ------------------------------------------------------------------ */
/* Per-host resolvers                                                  */
/* ------------------------------------------------------------------ */

async function resolveModsfire(pageUrl: string): Promise<ResolveResult> {
  const jar = `/tmp/mf-${randomUUID()}.jar`
  try {
    // Step 1: file page -> /download/{id}/{token}
    const step1 = await curl([...baseCurlArgs(jar), ...FOLLOW, pageUrl])
    if (step1.status === 404) return { mode: "external", reason: "File removed from Modsfire" }
    const dlPath = firstMatch(/href="(\/download\/[A-Za-z0-9]+\/[a-z0-9]+)"/, step1.body)
    if (!dlPath) return { mode: "external", reason: "Modsfire layout changed or anti-bot wall" }
    const dlUrl = `https://modsfire.com${dlPath}`

    // Step 2: download page -> /d/{id}
    const step2 = await curl([...baseCurlArgs(jar), ...FOLLOW, "-e", pageUrl, dlUrl])
    const dPath = firstMatch(/href="(\/d\/[A-Za-z0-9]+)"/, step2.body)
    if (!dPath) return { mode: "external", reason: "Modsfire download page changed" }

    // Step 3: /d/{id} responds 302 -> signed R2 URL (do NOT follow).
    const step3 = await curl([...baseCurlArgs(jar), "-e", dlUrl, "-D", "-", "-o", "/dev/null", `https://modsfire.com${dPath}`])
    const loc = firstMatch(/^[Ll]ocation:\s*(\S+)/m, step3.headers)
    if (!loc || !/^https:\/\//.test(loc)) {
      return { mode: "external", reason: "Modsfire did not return a file URL" }
    }
    return {
      mode: "proxy",
      streamUrl: loc,
      filename: basenameFromUrl(loc),
      ttlMs: 8 * 60_000, // signed URL is valid for 600 s
    }
  } catch {
    return { mode: "external", reason: "Modsfire unreachable" }
  } finally {
    // best-effort cleanup; jar files live in /tmp anyway
    execFile("rm", ["-f", jar], { timeout: 2000 }, () => {})
  }
}

async function resolveGdrive(url: string): Promise<ResolveResult> {
  const u = new URL(url)
  let id: string | null = null
  if (/\/file\/d\/([A-Za-z0-9_-]{10,})/.test(u.pathname)) {
    id = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/)?.[1] ?? null
  } else if (u.searchParams.get("id")) {
    id = u.searchParams.get("id")
  }
  if (!id) return { mode: "external", reason: "Could not read Drive file id" }
  return {
    mode: "proxy",
    streamUrl: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
    ttlMs: 30 * 60_000,
  }
}

async function resolvePixeldrain(url: string): Promise<ResolveResult> {
  const id = url.match(/pixeldrain\.com\/([A-Za-z0-9]+)/)?.[1]
  if (!id) return { mode: "external", reason: "Could not read Pixeldrain id" }
  return {
    mode: "proxy",
    streamUrl: `https://pixeldrain.com/api/file/${id}?download`,
    ttlMs: 30 * 60_000,
  }
}

async function resolveMediafire(url: string): Promise<ResolveResult> {
  const jar = `/tmp/mfdl-${randomUUID()}.jar`
  try {
    const res = await curl([...baseCurlArgs(jar), ...FOLLOW, url])
    const direct = firstMatch(/https:\/\/download\d*\.mediafire\.com\/[^\s"'<>\\]+/, res.body)
    if (!direct) return { mode: "external", reason: "Mediafire direct link not found" }
    return {
      mode: "proxy",
      streamUrl: direct.replace(/&amp;/g, "&"),
      filename: basenameFromUrl(direct),
      ttlMs: 20 * 60_000,
    }
  } catch {
    return { mode: "external", reason: "Mediafire unreachable" }
  } finally {
    execFile("rm", ["-f", jar], { timeout: 2000 }, () => {})
  }
}

function resolveDropbox(url: string): ResolveResult {
  const u = new URL(url)
  u.searchParams.set("dl", "1")
  return { mode: "proxy", streamUrl: u.toString(), ttlMs: 30 * 60_000 }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Hosts /api/download is allowed to proxy or redirect to (anti open-proxy). */
export const PROXY_ALLOWED_HOSTS = new Set([
  "modsfire",
  "mediafire",
  "gdrive",
  "pixeldrain",
  "dropbox",
  "discord",
  "workupload",
  "sharemods",
  "onedrive",
])

/**
 * Resolve a download link. Never throws — always returns a result, using the
 * "external" fallback for anything we cannot stream ourselves.
 */
export async function resolveDownload(url: string): Promise<ResolveResult> {
  const cached = getCached(url)
  if (cached) return cached

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { mode: "external", reason: "Malformed link" }
  }
  if (parsed.protocol !== "https:") return { mode: "external", reason: "Non-https link" }

  const h = parsed.hostname.replace(/^www\./, "").toLowerCase()
  let result: ResolveResult

  if (h.endsWith("modsfire.com") && /^\/[A-Za-z0-9]{6,}$/.test(parsed.pathname)) {
    result = await resolveModsfire(url)
  } else if (h.endsWith("drive.google.com") || h.endsWith("docs.google.com")) {
    result = /\/folders\//.test(parsed.pathname)
      ? { mode: "external", reason: "Drive folder — open it to pick a file" }
      : await resolveGdrive(url)
  } else if (h.endsWith("pixeldrain.com") && /^\/[ul]\/[A-Za-z0-9]+/.test(parsed.pathname)) {
    result = await resolvePixeldrain(url)
  } else if (h.endsWith("mediafire.com")) {
    result = await resolveMediafire(url)
  } else if (h.endsWith("dropbox.com")) {
    result = resolveDropbox(url)
  } else if (h.endsWith("cdn.discordapp.com") && parsed.pathname.startsWith("/attachments/")) {
    result = { mode: "proxy", streamUrl: url, ttlMs: 30 * 60_000 }
  } else if (h.endsWith("discord.gg") || h.endsWith("discord.com")) {
    result = { mode: "external", reason: "Discord invite — join to get the file" }
  } else if (h.endsWith("mega.nz") || h.endsWith("mega.io")) {
    result = { mode: "external", reason: "MEGA encrypts downloads in-browser" }
  } else {
    result = { mode: "external", reason: "Host does not allow direct downloads" }
  }

  setCached(url, result)
  return result
}
