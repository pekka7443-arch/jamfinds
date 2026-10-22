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
import { assertPublicUrl } from "@/lib/url-guard"
import { classifyUrl } from "@/lib/links"
import { fetchBeamfreePage } from "@/lib/scrapers"

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export type ResolveResult =
  | {
      mode: "proxy"
      streamUrl: string
      filename?: string
      /** Total file size in bytes when the host reported it (1-byte range probe). */
      size?: number
      /** Pretty provider label for the UI ("BeamFinds", "Modsfire"...). */
      fileHost?: string
      /** Referer to present when streaming from `streamUrl`. */
      referer?: string
      ttlMs: number
    }
  | { mode: "external"; reason: string }

/** Known direct-file hosts that BeamFree mod pages openly link to as the
 * creator's original source. These are safe to chain-resolve — they are the
 * same hosts JamFinds already supports, published by the creator themselves. */
const CHAINABLE_HOSTS = new Set(["modsfire", "mediafire", "pixeldrain", "gdrive", "dropbox", "discord"])
/** Preferred order when a BeamFree page links several mirrors. */
const CHAIN_PRIORITY = ["modsfire", "mediafire", "pixeldrain", "gdrive", "dropbox"]

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

/**
 * Drop a cached resolution — used when a stream later turns out to be dead
 * (expired signed URL, removed file) so the next click re-resolves fresh.
 */
export function invalidateResolve(url: string) {
  cache.delete(url)
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

/**
 * Cheap 1-byte range probe: does this URL actually serve a file (2xx/206, not
 * HTML)? Used before we claim "downloadable through JamFinds" — some CDNs
 * (modsfire's file edge included) answer the resolver chain with a Location
 * but then 403 the file itself (IP/JS-gated). Curl is used for the probe so
 * TLS-fingerprint-gated CDNs don't produce false negatives.
 *
 * Also captures the total size (from Content-Range/Content-Length) and
 * whether the host honoured the Range request — both surface in the UI and
 * make the honest "verified file" promise possible.
 */
export interface ProbeInfo {
  ok: boolean
  status: number
  contentType: string
  /** Total bytes when reported by the host, else null. */
  size: number | null
  /** True when the host answered the 1-byte range with 206. */
  acceptRanges: boolean
}

function probeFileInfo(url: string, referer: string, timeoutMs = 20_000): Promise<ProbeInfo> {
  return new Promise((resolve) => {
    const args = [
      "-s",
      "--location", // follow the redirect chain (modsfire's signed d.php -> R2)
      "--http1.1",
      "--max-time",
      String(Math.ceil(timeoutMs / 1000)),
      "--max-redirs",
      "4",
      "--proto",
      "=https",
      "--proto-redir",
      "=https",
      "-A",
      BROWSER_UA,
      "-e",
      referer,
      "-r",
      "0-0",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}\t%{content_type}\t%{size_download}",
      url,
    ]
    execFile("curl", args, { timeout: timeoutMs + 5_000 }, (err, stdout) => {
      const line = String(stdout).trim()
      const [code = "", ctypeRaw = "", dlRaw = ""] = line.split("\t")
      const status = Number(code) || 0
      const contentType = ctypeRaw.toLowerCase()
      // size_download is the 1-byte body; the TOTAL comes from the
      // Content-Range header, which -w cannot read. Fall back to a -D
      // header dump only when it matters — for the UI the Content-Length
      // of a plain HEAD-style probe is enough, so re-run cheaply.
      const downloaded = Number(dlRaw) || 0
      const ok = !err && status >= 200 && status < 300 && !contentType.includes("text/html")
      resolve({ ok, status, contentType, size: ok ? downloaded || null : null, acceptRanges: status === 206 })
    })
  })
}

/**
 * Header-dumping probe variant: same 1-byte request but parses the real
 * Content-Range/Content-Length headers, giving the true total size.
 * Slightly heavier than probeFileInfo (header block instead of -w), still
 * one short request. Used by resolve endpoints that surface file size.
 */
function probeFileInfoFull(url: string, referer: string, timeoutMs = 20_000): Promise<ProbeInfo> {
  return new Promise((resolve) => {
    const args = [
      "-s",
      "--location", // follow the redirect chain (modsfire's signed d.php -> R2)
      "--http1.1",
      "--max-time",
      String(Math.ceil(timeoutMs / 1000)),
      "--max-redirs",
      "4",
      "--proto",
      "=https",
      "--proto-redir",
      "=https",
      "-A",
      BROWSER_UA,
      "-e",
      referer,
      "-r",
      "0-0",
      "-o",
      "/dev/null",
      "-D",
      "-",
      url,
    ]
    execFile("curl", args, { timeout: timeoutMs + 5_000 }, (err, stdout) => {
      const head = String(stdout)
      // With a redirect chain (-D - dumps EVERY hop's headers) the FIRST
      // HTTP/ line is the 302, not the final answer — always read the LAST.
      const statuses = [...head.matchAll(/HTTP\/[\d.]+\s+(\d{3})/g)].map((m) => Number(m[1]))
      const status = statuses[statuses.length - 1] ?? 0
      const last = (name: string) => {
        // (.*) — values like "bytes 0-0/69920160" contain spaces; \S* would
        // truncate to just "bytes" and break the Content-Range total parse.
        const all = [...head.matchAll(new RegExp(`^${name}:\\s*(.*)$`, "img"))].map((m) => m[1].trim())
        return all[all.length - 1] ?? ""
      }
      const contentType = last("content-type").toLowerCase()
      const cr = last("content-range").match(/^bytes\s+\d+-\d+\/(\d+)$/)?.[1]
      const cl = last("content-length")
      const acceptRanges = status === 206
      const ok = !err && status >= 200 && status < 300 && !contentType.includes("text/html")
      const size = ok ? (cr ? Number(cr) : cl ? Number(cl) : null) : null
      resolve({ ok, status, contentType, size: size && Number.isFinite(size) ? size : null, acceptRanges })
    })
  })
}

/** Boolean wrapper kept for the streaming fallback in /api/download. */
function curlProbeFile(url: string, referer: string, timeoutMs = 20_000): Promise<boolean> {
  return probeFileInfo(url, referer, timeoutMs).then((p) => p.ok)
}

export { curlProbeFile as probeFileUrl, probeFileInfoFull as probeFileWithSize }

/**
 * Capture a redirect's Location WITHOUT following it (curl-first — Node's
 * TLS fingerprint is 403'd by BeamFinds' edge). Returns status + Location.
 */
function curlRedirectTarget(url: string, referer: string, timeoutMs = 20_000): Promise<{ status: number; location: string | null }> {
  return new Promise((resolve, reject) => {
    const args = [
      "-s",
      "--http1.1",
      "--max-time",
      String(Math.ceil(timeoutMs / 1000)),
      "--proto",
      "=https",
      "--proto-redir",
      "=https",
      "-A",
      BROWSER_UA,
      "-e",
      referer,
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}\t%{redirect_url}",
      url,
    ]
    execFile("curl", args, { timeout: timeoutMs + 5_000 }, (err, stdout) => {
      if (err && !stdout) return reject(new Error("curl failed"))
      const [code = "", loc = ""] = String(stdout).trim().split("\t")
      resolve({ status: Number(code) || 0, location: loc || null })
    })
  })
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
    // Validate the signed URL before we ever fetch it (SSRF guard).
    try {
      assertPublicUrl(loc)
    } catch {
      return { mode: "external", reason: "Modsfire returned an unexpected file URL" }
    }
    // Verify the file URL is actually fetchable — their file edge sometimes
    // 403s (IP/JS-gated) right after handing out the Location. Without this
    // check the UI would promise a direct download that degrades to a redirect.
    const probe = await probeFileInfoFull(loc, pageUrl)
    if (!probe.ok) {
      return { mode: "external", reason: "Modsfire is not serving this file directly right now" }
    }
    return {
      mode: "proxy",
      streamUrl: loc,
      filename: basenameFromUrl(loc),
      size: probe.size ?? undefined,
      fileHost: "Modsfire",
      referer: pageUrl,
      ttlMs: 6 * 60_000, // signed URL is valid for 600 s — leave margin
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
  const streamUrl = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`
  // Probe: confirm Drive streams a file (not a scan-warning HTML page) and
  // grab the size for the UI.
  const probe = await probeFileInfoFull(streamUrl, url)
  if (!probe.ok) return { mode: "external", reason: "Google Drive is not serving this file directly right now" }
  return {
    mode: "proxy",
    streamUrl,
    size: probe.size ?? undefined,
    fileHost: "Google Drive",
    referer: url,
    ttlMs: 30 * 60_000,
  }
}

async function resolvePixeldrain(url: string): Promise<ResolveResult> {
  const id = url.match(/pixeldrain\.com\/([A-Za-z0-9]+)/)?.[1]
  if (!id) return { mode: "external", reason: "Could not read Pixeldrain id" }
  const streamUrl = `https://pixeldrain.com/api/file/${id}?download`
  // Probe: the file may be gone (404) or paywalled — verify before promising.
  const probe = await probeFileInfoFull(streamUrl, url)
  if (!probe.ok) return { mode: "external", reason: "Pixeldrain is not serving this file directly right now" }
  return {
    mode: "proxy",
    streamUrl,
    size: probe.size ?? undefined,
    fileHost: "Pixeldrain",
    referer: url,
    ttlMs: 30 * 60_000,
  }
}

async function resolveMediafire(url: string): Promise<ResolveResult> {
  const jar = `/tmp/mfdl-${randomUUID()}.jar`
  try {
    const res = await curl([...baseCurlArgs(jar), ...FOLLOW, url])
    const direct = firstMatch(/https:\/\/download\d*\.mediafire\.com\/[^\s"'<>\\]+/, res.body)
    if (!direct) return { mode: "external", reason: "Mediafire direct link not found" }
    const streamUrl = direct.replace(/&amp;/g, "&")
    // Validate before returning (SSRF guard — defense in depth).
    try {
      assertPublicUrl(streamUrl)
    } catch {
      return { mode: "external", reason: "Mediafire returned an unexpected link" }
    }
    const probe = await probeFileInfoFull(streamUrl, url)
    if (!probe.ok) return { mode: "external", reason: "Mediafire is not serving this file directly right now" }
    return {
      mode: "proxy",
      streamUrl,
      filename: basenameFromUrl(streamUrl),
      size: probe.size ?? undefined,
      fileHost: "Mediafire",
      referer: url,
      ttlMs: 20 * 60_000,
    }
  } catch {
    return { mode: "external", reason: "Mediafire unreachable" }
  } finally {
    execFile("rm", ["-f", jar], { timeout: 2000 }, () => {})
  }
}

async function resolveDropbox(url: string): Promise<ResolveResult> {
  const u = new URL(url)
  u.searchParams.set("dl", "1")
  const streamUrl = u.toString()
  const probe = await probeFileInfoFull(streamUrl, url)
  if (!probe.ok) return { mode: "external", reason: "Dropbox is not serving this file directly right now" }
  return {
    mode: "proxy",
    streamUrl,
    size: probe.size ?? undefined,
    fileHost: "Dropbox",
    referer: url,
    ttlMs: 30 * 60_000,
  }
}

/* ------------------------------------------------------------------ */
/* Aggregator mod-page resolvers                                       */
/* ------------------------------------------------------------------ */

/**
 * BeamFinds mod pages (beamfinds.com/mod/{id}).
 *
 * BeamFinds runs a PUBLIC download API: GET
 * /api/public/v1/mods/{id}/download answers 302 with a signed file URL on
 * their dl.beamfinds.com CDN — no auth, no challenge, no client-side token.
 * It is exactly what their own site's download button uses, so streaming
 * that URL is using their published interface, not bypassing anything.
 * Files stay on BeamFinds' storage — JamFinds streams on demand, mirrors
 * nothing, and always links back to the original mod page.
 */
async function resolveBeamfinds(pageUrl: string): Promise<ResolveResult> {
  const id = pageUrl.match(/beamfinds\.com\/mod\/(\d+)/i)?.[1]
  if (!id) return { mode: "external", reason: "Not a BeamFinds mod page" }
  const api = `https://beamfinds.com/api/public/v1/mods/${id}/download`

  let status = 0
  let loc: string | null = null
  try {
    const r = await curlRedirectTarget(api, pageUrl)
    status = r.status
    loc = r.location
  } catch {
    return { mode: "external", reason: "BeamFinds is unreachable right now" }
  }

  // Rare path: the API streams the file itself instead of redirecting.
  if (status === 200 && !loc) {
    const probe = await probeFileInfoFull(api, pageUrl)
    if (!probe.ok) return { mode: "external", reason: "BeamFinds did not hand out a file URL" }
    return {
      mode: "proxy",
      streamUrl: api,
      size: probe.size ?? undefined,
      fileHost: "BeamFinds",
      referer: pageUrl,
      ttlMs: 10 * 60_000,
    }
  }

  if (!loc || !/^https:\/\//i.test(loc)) {
    // 404 (mod deleted), 403 or an HTML answer — the honest fallback is the
    // mod page itself, where BeamFinds serves the download.
    return {
      mode: "external",
      reason: status === 404 ? "File removed from BeamFinds" : "BeamFinds is not serving this file directly right now",
    }
  }

  // SSRF guard: their redirect target is fetched by THIS server.
  try {
    assertPublicUrl(loc)
  } catch {
    return { mode: "external", reason: "BeamFinds returned an unexpected file URL" }
  }
  const probe = await probeFileInfoFull(loc, pageUrl)
  if (!probe.ok) {
    return { mode: "external", reason: "BeamFinds is not serving this file directly right now" }
  }
  return {
    mode: "proxy",
    streamUrl: loc,
    filename: basenameFromUrl(loc),
    size: probe.size ?? undefined,
    fileHost: "BeamFinds",
    referer: pageUrl,
    ttlMs: 30 * 60_000,
  }
}

/** Pull external hrefs out of an HTML page, decoded + deduplicated. */
function extractExternalHrefs(html: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/href="(https?:\/\/[^"']+)"/g)) {
    out.add(m[1].replace(/&amp;/g, "&"))
  }
  return [...out]
}

/**
 * BeamFree mod pages (beamfree.pro/mod/{id}).
 *
 * BeamFree's own /dl/ file endpoint is POLICY-GATED: it 403s any client that
 * is not a visitor of their site (their page says to disable ad blockers and
 * press Download there). That is an access control — JamFinds does not and
 * must not bypass it, so BeamFree-hosted files always fall back honestly to
 * the BeamFree mod page.
 *
 * HOWEVER, BeamFree openly publishes the creator's ORIGINAL file-host link
 * on many mod pages (e.g. a Modsfire or Mediafire URL). When present, that
 * link is a completely ordinary download of the creator's own chosen host —
 * the same kind of link JamFinds indexes from Reddit — and can be resolved
 * through the normal per-host resolvers below.
 */
async function resolveBeamfree(pageUrl: string, depth: number): Promise<ResolveResult> {
  if (!/beamfree\.pro\/mod\/\d+/i.test(pageUrl)) {
    return { mode: "external", reason: "Not a BeamFree mod page" }
  }
  let html: string
  try {
    html = await fetchBeamfreePage(pageUrl)
  } catch {
    return { mode: "external", reason: "BeamFree page unavailable (mod may have been removed)" }
  }

  // Candidate original-source links, prioritised by how well we can serve them.
  const candidates: { host: string; url: string }[] = []
  for (const href of extractExternalHrefs(html)) {
    const { host } = classifyUrl(href)
    if (!CHAINABLE_HOSTS.has(host)) continue
    if (host === "discord") continue // invites are never files
    if (host === "gdrive" && !/drive\.google\.com\/file\/d\//.test(href)) continue // folders only on their page
    if (!candidates.some((c) => c.url === href)) candidates.push({ host, url: href })
  }
  candidates.sort((a, b) => CHAIN_PRIORITY.indexOf(a.host) - CHAIN_PRIORITY.indexOf(b.host))

  for (const c of candidates) {
    if (depth >= 1) break // hard recursion cap
    const r = await resolveDownload(c.url, depth + 1)
    if (r.mode === "proxy") {
      return { ...r, fileHost: r.fileHost ?? hostLabel(c.host) }
    }
  }

  if (candidates.length > 0) {
    const labels = [...new Set(candidates.map((c) => hostLabel(c.host)))].join(", ")
    return {
      mode: "external",
      reason: `The creator hosts this file on ${labels} — open the BeamFree page to get it`,
    }
  }
  return { mode: "external", reason: "BeamFree requires downloading from their own site" }
}

/** Pretty label for a canonical host key ("modsfire" -> "Modsfire"). */
const HOST_LABELS: Record<string, string> = {
  modsfire: "Modsfire",
  mediafire: "Mediafire",
  pixeldrain: "Pixeldrain",
  gdrive: "Google Drive",
  dropbox: "Dropbox",
  discord: "Discord",
  beamfinds: "BeamFinds",
  beamfree: "BeamFree",
}

function hostLabel(hostKey: string): string {
  return HOST_LABELS[hostKey] ?? "the creator's host"
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
  "beamfinds",
  "beamfree",
])

/**
 * Resolve a download link. Never throws — always returns a result, using the
 * "external" fallback for anything we cannot stream ourselves.
 *
 * `depth` caps chained resolution (BeamFree page -> creator's host) so a
 * page that links another aggregator page can never loop.
 * Concurrent identical requests share one in-flight promise (no double scraping).
 */
const inflight = new Map<string, Promise<ResolveResult>>()

export async function resolveDownload(url: string, depth = 0): Promise<ResolveResult> {
  const cached = getCached(url)
  if (cached) return cached
  const running = inflight.get(url)
  if (running) return running

  const p = doResolveDownload(url, depth).finally(() => inflight.delete(url))
  inflight.set(url, p)
  return p
}

async function doResolveDownload(url: string, depth: number): Promise<ResolveResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { mode: "external", reason: "Malformed link" }
  }
  if (parsed.protocol !== "https:") return { mode: "external", reason: "Non-https link" }

  const h = parsed.hostname.replace(/^www\./, "").toLowerCase()
  // Label-aware suffix match — a plain endsWith() would let lookalike
  // domains (e.g. "evilmediafire.com") reach the resolvers.
  const isHost = (...domains: string[]) => domains.some((d) => h === d || h.endsWith(`.${d}`))
  let result: ResolveResult

  if (isHost("modsfire.com") && /^\/[A-Za-z0-9]{6,}$/.test(parsed.pathname)) {
    result = await resolveModsfire(url)
  } else if (isHost("drive.google.com", "docs.google.com")) {
    result = /\/folders\//.test(parsed.pathname)
      ? { mode: "external", reason: "Drive folder — open it to pick a file" }
      : await resolveGdrive(url)
  } else if (isHost("pixeldrain.com") && /^\/[ul]\/[A-Za-z0-9]+/.test(parsed.pathname)) {
    result = await resolvePixeldrain(url)
  } else if (isHost("mediafire.com")) {
    result = await resolveMediafire(url)
  } else if (isHost("dropbox.com")) {
    result = await resolveDropbox(url)
  } else if (isHost("cdn.discordapp.com") && parsed.pathname.startsWith("/attachments/")) {
    // Discord CDN attachments are direct files; still probe before promising.
    const probe = await probeFileInfoFull(url, url)
    result = probe.ok
      ? { mode: "proxy", streamUrl: url, size: probe.size ?? undefined, fileHost: "Discord", referer: url, ttlMs: 30 * 60_000 }
      : { mode: "external", reason: "Discord is not serving this attachment right now (it may have expired)" }
  } else if (isHost("discord.gg", "discord.com")) {
    result = { mode: "external", reason: "Discord invite — join to get the file" }
  } else if (isHost("mega.nz", "mega.io")) {
    result = { mode: "external", reason: "MEGA encrypts downloads in-browser" }
  } else if (isHost("beamfinds.com")) {
    result = /^\/mod\/\d+/.test(parsed.pathname)
      ? await resolveBeamfinds(url)
      : { mode: "external", reason: "Open the BeamFinds page" }
  } else if (isHost("beamfree.pro")) {
    result = /^\/mod\/\d+/.test(parsed.pathname)
      ? await resolveBeamfree(url, depth)
      : { mode: "external", reason: "Open the BeamFree page" }
  } else if (isHost("workupload.com")) {
    // Verified 2026-10: workupload serves a "Are you a human?" security
    // check to automated clients — an anti-bot protection we do not bypass.
    result = { mode: "external", reason: "Workupload checks that you are human — start the download on their page" }
  } else if (isHost("sharemods.com")) {
    // Verified 2026-10: sharemods requires their two-step JS page flow.
    result = { mode: "external", reason: "ShareMods requires their two-step page flow — start the download on their site" }
  } else if (isHost("onedrive.live.com", "1drv.ms")) {
    result = { mode: "external", reason: "OneDrive shares need Microsoft's own download flow" }
  } else {
    result = { mode: "external", reason: "Host does not allow direct downloads" }
  }

  setCached(url, result)
  return result
}
