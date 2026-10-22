/**
 * Download resolution status — lets the UI know BEFORE the user clicks
 * whether a link will download directly through JamFinds itself ("proxy") or
 * fall back to opening the host site ("external").
 *
 * GET /api/download/resolve?url=<encoded link>
 * -> { mode: "proxy", filename?, size?, fileHost? }
 *    { mode: "external", reason? }
 *
 * "proxy" means the file verifiably streams through JamFinds (the resolver
 * 1-byte-probed the actual file before answering).
 * "external" means the provider requires its own site — `reason` explains
 * why, honestly, so the UI can say exactly that instead of pretending.
 *
 * Results share resolvers.ts' in-memory cache, so the subsequent
 * /api/download click reuses the resolution (no double scraping).
 * Rate limited per IP — resolution scrapes the upstream host.
 */

import type { NextRequest } from "next/server"
import { resolveDownload, PROXY_ALLOWED_HOSTS } from "@/lib/resolvers"
import { classifyUrl } from "@/lib/links"
import { isInternalTarget } from "@/lib/url-guard"
import { rateLimit, limitKey, tooManyRequests } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const rl = rateLimit(limitKey("resolve", req), 30, 60_000)
  if (!rl.ok) return tooManyRequests(rl.retryAfterS)

  const url = req.nextUrl.searchParams.get("url")
  if (!url) {
    return Response.json({ mode: "external", reason: "missing url" }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return Response.json({ mode: "external", reason: "bad url" }, { status: 400 })
  }

  const { host } = classifyUrl(url)
  if (parsed.protocol !== "https:" || isInternalTarget(parsed) || !PROXY_ALLOWED_HOSTS.has(host)) {
    return Response.json({ mode: "external" })
  }

  try {
    const result = await resolveDownload(url)
    if (result.mode === "proxy") {
      return Response.json({
        mode: "proxy",
        filename: result.filename ?? null,
        size: result.size ?? null,
        fileHost: result.fileHost ?? null,
      })
    }
    return Response.json({ mode: "external", reason: result.reason })
  } catch {
    return Response.json({ mode: "external", reason: "resolution failed" })
  }
}
