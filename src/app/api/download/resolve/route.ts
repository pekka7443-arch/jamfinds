/**
 * Download resolution status — lets the UI know BEFORE the user clicks
 * whether a link will download directly through JamFinds ("proxy") or
 * fall back to opening the host site ("external").
 *
 * GET /api/download/resolve?url=<encoded link>
 * -> { mode: "proxy" | "external", filename?: string, reason?: string }
 *
 * Results share resolvers.ts' in-memory cache, so the subsequent
 * /api/download click reuses the resolution (no double scraping).
 */

import type { NextRequest } from "next/server"
import { resolveDownload, PROXY_ALLOWED_HOSTS } from "@/lib/resolvers"
import { classifyUrl } from "@/lib/links"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
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
  if (parsed.protocol !== "https:" || !PROXY_ALLOWED_HOSTS.has(host)) {
    return Response.json({ mode: "external" })
  }

  try {
    const result = await resolveDownload(url)
    if (result.mode === "proxy") {
      return Response.json({ mode: "proxy", filename: result.filename ?? null })
    }
    return Response.json({ mode: "external", reason: result.reason })
  } catch {
    return Response.json({ mode: "external", reason: "resolution failed" })
  }
}
