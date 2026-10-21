/**
 * Download proxy — files download FROM JamFinds, not from the file host.
 *
 * GET /api/download?url=<encoded link>&name=<optional fallback filename>
 *
 *  1. The link is validated against a host allowlist (no open proxy).
 *  2. resolvers.ts finds the host's *direct* file URL (e.g. ModsFire's signed
 *     R2 URL, Google Drive's usercontent endpoint...).
 *  3. The file is streamed through this server with a Content-Disposition
 *     attachment header, so the browser saves it while staying on JamFinds.
 *     Range requests are forwarded so paused/resumed downloads work.
 *  4. If the host can't be proxied (MEGA, BeamFree IP-bound tokens, BeamFinds
 *     JS-gated buttons, dead links...) we gracefully 307-redirect to the
 *     original link — the classic external behaviour.
 */

import type { NextRequest } from "next/server"
import { resolveDownload, PROXY_ALLOWED_HOSTS } from "@/lib/resolvers"
import { classifyUrl } from "@/lib/links"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

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
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Referer: referer,
    Accept: "*/*",
  }
  if (range) headers.Range = range

  let upstream: globalThis.Response
  try {
    upstream = await fetch(streamUrl, { headers, redirect: "follow", cache: "no-store" })
    if (!upstream.ok && upstream.status !== 206) {
      throw new Error(`upstream ${upstream.status}`)
    }
  } catch {
    // Some CDNs reject Node's TLS fingerprint — pipe through curl instead.
    const { spawn } = await import("node:child_process")
    const { Readable } = await import("node:stream")
    const args = ["-sL", "--http1.1", "-A", BROWSER_UA, "-e", referer, streamUrl]
    if (range) args.push("-H", `Range: ${range}`)
    const child = spawn("curl", args)
    return new Response(Readable.toWeb(child.stdout) as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": contentDisposition(fallbackName),
        "Cache-Control": "no-store",
      },
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
  if (target.protocol !== "https:") return new Response("Only https links", { status: 400 })

  // Allowlist: only known file hosts may be fetched by the server.
  const { host } = classifyUrl(url)
  if (!PROXY_ALLOWED_HOSTS.has(host)) return redirect(url)

  const resolved = await resolveDownload(url)
  if (resolved.mode === "external") return redirect(url)

  const finalName = resolved.filename || (/\.[a-z0-9]{2,5}$/i.test(fallbackName) ? fallbackName : `${fallbackName}.zip`)
  return streamUpstream(resolved.streamUrl, url, req.headers.get("range"), finalName)
}
