/**
 * Download proxy — files download FROM JamFinds, not from the file host.
 *
 * GET /api/download?url=<encoded link>&name=<optional fallback filename>
 *
 *  1. The link is validated (https, no internal targets) and checked against
 *     a host allowlist — known file hosts get proxied, other *known* file
 *     hosts get a redirect, everything else is refused (no open proxy, no
 *     open redirector).
 *  2. resolvers.ts finds the host's *direct* file URL (e.g. ModsFire's signed
 *     R2 URL, Google Drive's usercontent endpoint...). That URL is
 *     re-validated before fetching.
 *  3. The file is streamed through this server with a Content-Disposition
 *     attachment header. Redirect hops are followed manually (max 4) and
 *     every hop is re-validated; HTML responses are refused instead of being
 *     served as a bogus .zip. Range requests are forwarded.
 *  4. If the host can't be proxied (MEGA, BeamFree IP-bound tokens, BeamFinds
 *     JS-gated buttons, dead links...) we 307-redirect to the original link.
 *
 * Rate limited per client IP to prevent abuse as a bandwidth relay.
 */

import type { NextRequest } from "next/server"
import { resolveDownload, PROXY_ALLOWED_HOSTS, probeFileWithSize, invalidateResolve } from "@/lib/resolvers"
import { classifyUrl, isDownloadLink } from "@/lib/links"
import { assertPublicUrl, isInternalTarget } from "@/lib/url-guard"
import { rateLimit, limitKey, tooManyRequests } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

/** Time to wait for the upstream response HEADERS before giving up. */
const HEADER_TIMEOUT_MS = 30_000
/** Max redirect hops followed manually — every hop re-validated. */
const MAX_HOPS = 4

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\r\n"\\]/g, "")
    .replace(/[/\\?%*:|<>]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 120)
  return cleaned || "mod-download"
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_")
  const utf8 = encodeURIComponent(filename)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
}

/** 307 to the original link — only for URLs that are known file hosts. */
function redirect(url: string): Response {
  return new Response(null, {
    status: 307,
    headers: { Location: url, "Cache-Control": "no-store" },
  })
}

/** Stream a URL to the client; native fetch first, curl spawn as TLS fallback. */
async function streamUpstream(
  streamUrl: string,
  referer: string,
  range: string | null,
  fallbackName: string,
): Promise<Response> {
  const baseHeaders: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Referer: referer,
    Accept: "*/*",
  }
  if (range) baseHeaders.Range = range

  /**
   * fetch() with redirect:"manual" — every hop is parsed and validated
   * (https, no internal targets) before being followed, so a compromised or
   * open-redirecting upstream can't pivot the server at internal endpoints.
   */
  let upstream: globalThis.Response | null = null
  let currentUrl = streamUrl
  let fetchStatusError = ""
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), HEADER_TIMEOUT_MS)
    try {
      const res = await fetch(currentUrl, {
        headers: baseHeaders,
        redirect: "manual",
        cache: "no-store",
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location")
        if (!loc) break // no Location on a redirect — treat as final (body only)
        // Relative Location is resolved against the current URL.
        const next = new URL(loc, currentUrl).toString()
        assertPublicUrl(next) // throws on non-https / internal targets
        currentUrl = next
        continue
      }
      if (!res.ok && res.status !== 206) {
        fetchStatusError = `upstream ${res.status}`
        throw new Error(fetchStatusError)
      }
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase()
      if (contentType.includes("text/html")) {
        // An HTML page is never the mod file — the host served an error /
        // interstitial page instead of the file.
        throw new Error("upstream returned html, not a file")
      }
      upstream = res
      break
    } catch (err) {
      clearTimeout(timer)
      // SSRF-validation failures must never be retried via curl — rethrow.
      if ((err as Error).message.startsWith("url target") || (err as Error).message === "malformed url") {
        throw err
      }
      // 404/410 mean the file is gone — curl won't help, degrade to external.
      if (/^upstream (404|410)$/.test((err as Error).message)) throw err
      // Everything else (TLS-fingerprint 403s, connection failures, HTML
      // interstitials from fingerprint-gated CDNs) falls through to curl.
      fetchStatusError = fetchStatusError || "fetch failed"
      upstream = null
      break
    }
  }

  if (!upstream) {
    // Several CDNs (modsfire's included) reject Node's TLS fingerprint with
    // 403/HTML while curl passes. Probe with the shared 1-byte curl helper
    // before spawning a streaming curl — if the file isn't really served
    // (IP-gated, dead), degrade to the external redirect instead of
    // shipping a bogus .zip. The probe also tells us whether the host
    // honoured our Range request, so we never claim 206 we didn't get.
    const { spawn } = await import("node:child_process")
    const { Readable } = await import("node:stream")
    const probe = await probeFileWithSize(streamUrl, referer)
    if (!probe.ok) {
      throw new Error(fetchStatusError || "upstream did not serve a file")
    }

    const args = [
      "-sL",
      "--http1.1",
      "--max-time",
      "900",
      "--max-redirs",
      String(MAX_HOPS),
      "--proto",
      "=https",
      "--proto-redir",
      "=https",
      "-A",
      BROWSER_UA,
      "-e",
      referer,
      streamUrl,
    ]
    if (range) args.push("-H", `Range: ${range}`)
    const child = spawn("curl", args)

    // The streaming curl can't echo upstream headers, so reconstruct the
    // range headers from the probe: the client (and download managers) need
    // Content-Range to know the total size of a partial response.
    const outHeaders: Record<string, string> = {
      "Content-Type": probe.contentType || "application/octet-stream",
      "Content-Disposition": contentDisposition(fallbackName),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    }
    if (probe.acceptRanges) outHeaders["Accept-Ranges"] = "bytes"
    if (range && probe.acceptRanges && probe.size) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
      if (m) {
        const start = m[1] ? Number(m[1]) : 0
        const end = Math.min(m[2] ? Number(m[2]) : probe.size - 1, probe.size - 1)
        if (start <= end && start < probe.size) {
          outHeaders["Content-Range"] = `bytes ${start}-${end}/${probe.size}`
        }
      }
    }
    return new Response(Readable.toWeb(child.stdout) as unknown as ReadableStream, {
      status: range && probe.acceptRanges ? 206 : 200,
      headers: outHeaders,
    })
  }

  const out = new Headers()
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = upstream.headers.get(h)
    if (v) out.set(h, v)
  }
  if (!out.has("content-type")) out.set("content-type", "application/octet-stream")

  // Filename priority: upstream Content-Disposition > resolver > ?name=.
  const cd = upstream.headers.get("content-disposition")
  const upstreamName = cd?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] ?? ""
  out.set("Content-Disposition", contentDisposition(sanitizeFilename(upstreamName || fallbackName)))
  out.set("Cache-Control", "no-store")
  out.set("X-Content-Type-Options", "nosniff")

  return new Response(upstream.body, { status: upstream.status, headers: out })
}

export async function GET(req: NextRequest) {
  // Abuse guard: a public bandwidth relay must not be free.
  const rl = rateLimit(limitKey("dl", req), 12, 60_000)
  if (!rl.ok) return tooManyRequests(rl.retryAfterS)

  const sp = req.nextUrl.searchParams
  const url = sp.get("url")
  const name = sp.get("name")
  const fallbackName = sanitizeFilename(name || "mod-download.zip")

  if (!url) return new Response("Missing ?url", { status: 400 })

  let target: URL
  try {
    target = new URL(url)
  } catch {
    return new Response("Bad ?url", { status: 400 })
  }
  if (target.protocol !== "https:" || isInternalTarget(target)) {
    return new Response("Only public https links", { status: 400 })
  }

  // Allowlist: known file hosts may be fetched by the server; other known
  // file hosts (modland, gofile, discord CDN...) get a browser redirect;
  // anything else is refused — JamFinds is not an open redirector.
  const { host } = classifyUrl(url)
  if (!PROXY_ALLOWED_HOSTS.has(host)) {
    if (isDownloadLink({ host, url })) return redirect(url)
    return new Response("Host is not a known mod file host", { status: 400 })
  }

  const resolved = await resolveDownload(url)
  if (resolved.mode === "external") return redirect(url)

  // Re-validate the resolved stream URL (defense in depth against a
  // resolver returning something unexpected).
  try {
    assertPublicUrl(resolved.streamUrl)
  } catch {
    return redirect(url)
  }

  const finalName = resolved.filename || (/\.[a-z0-9]{2,5}$/i.test(fallbackName) ? fallbackName : `${fallbackName}.zip`)
  try {
    // Prefer the referer the resolver learned (e.g. the BeamFinds mod page
    // for dl.beamfinds.com streams) over the raw link.
    return await streamUpstream(resolved.streamUrl, resolved.referer || url, req.headers.get("range"), finalName)
  } catch {
    // Resolution said "file", upstream disagreed (HTML page, dead link,
    // expired signed URL...). Drop the stale cache entry so the next click
    // re-resolves, then degrade honestly to the original link.
    invalidateResolve(url)
    return redirect(url)
  }
}
