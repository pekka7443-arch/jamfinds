import { NextResponse, type NextRequest } from "next/server"
import { forceSync, isSyncRunning, startSyncLoop } from "@/lib/sync"
import { rateLimit, limitKey, tooManyRequests } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

/**
 * Manual refresh: forces an immediate sync and waits for it.
 * Rate limited per IP — a forced sync fans out to 6 upstream sources.
 * Bursts are fine (the UI button + auto-retry), floods are not.
 */
export async function POST(req: NextRequest) {
  // 2 per 10s keeps the refresh button responsive; 8 per 5 min blocks abuse.
  const burst = rateLimit(limitKey("sync-burst", req), 2, 10_000)
  if (!burst.ok) return tooManyRequests(burst.retryAfterS)
  const sustained = rateLimit(limitKey("sync-sustained", req), 8, 300_000)
  if (!sustained.ok) return tooManyRequests(sustained.retryAfterS)

  startSyncLoop()
  if (isSyncRunning()) {
    return NextResponse.json({ ok: true, running: true, message: "Sync already in progress" })
  }
  const result = await forceSync()
  return NextResponse.json({ ok: result.ok, running: false, result })
}
