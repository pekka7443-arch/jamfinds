import { NextResponse } from "next/server"
import { forceSync, isSyncRunning, startSyncLoop } from "@/lib/sync"

export const dynamic = "force-dynamic"

/** Manual refresh: forces an immediate Reddit sync and waits for it. */
export async function POST() {
  startSyncLoop()
  if (isSyncRunning()) {
    return NextResponse.json({ ok: true, running: true, message: "Sync already in progress" })
  }
  const result = await forceSync()
  return NextResponse.json({ ok: result.ok, running: false, result })
}
