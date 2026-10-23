import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit, limitKey, tooManyRequests } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

/**
 * Web Push subscriptions (Task 15).
 *
 *  GET    -> { publicKey }   VAPID public key for pushManager.subscribe (null when push is not configured)
 *  POST   -> { ok: true }    store/update a PushSubscription JSON
 *  DELETE -> { ok: true }    remove a subscription by endpoint (bell toggle off)
 *
 * Push delivery itself happens in the sync engine (src/lib/sync.ts) after a
 * sync with new inserts. Storage is a single PushSub row per endpoint.
 */

interface SubscribeBody {
  endpoint?: unknown
  keys?: unknown
}

function parseSubscription(body: SubscribeBody): { endpoint: string; keysJson: string } | null {
  if (!body || typeof body.endpoint !== "string") return null
  const endpoint = body.endpoint.trim()
  // Only real https push-service endpoints are ever useful (and they are
  // what browsers hand out); refuse anything else outright.
  if (!/^https:\/\/[\w.-]+\/?/.test(endpoint) || endpoint.length > 2048) return null
  const keys = body.keys as { p256dh?: unknown; auth?: unknown } | undefined
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null
  // Real browser subscriptions carry an uncompressed P-256 point (65 bytes)
  // and a >=16-byte auth secret — reject anything else so the fan-out never
  // has to deal with format-invalid rows.
  try {
    if (Buffer.from(keys.p256dh, "base64url").length !== 65) return null
    if (Buffer.from(keys.auth, "base64url").length < 16) return null
  } catch {
    return null
  }
  return { endpoint, keysJson: JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth }) }
}

export async function GET() {
  return NextResponse.json(
    { publicKey: process.env.VAPID_PUBLIC ?? null },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(req: NextRequest) {
  // Subscribes are small writes — a modest cap blocks flooding without
  // ever touching real users (a browser subscribes once per change).
  const burst = rateLimit(limitKey("push-sub", req), 10, 60_000)
  if (!burst.ok) return tooManyRequests(burst.retryAfterS)

  let body: SubscribeBody
  try {
    body = (await req.json()) as SubscribeBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = parseSubscription(body)
  if (!parsed) {
    return NextResponse.json({ error: "Invalid PushSubscription payload" }, { status: 400 })
  }

  await db.pushSub.upsert({
    where: { endpoint: parsed.endpoint },
    create: { endpoint: parsed.endpoint, keys: parsed.keysJson },
    update: { keys: parsed.keysJson }, // keys rotate on re-subscribe
  })
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
}

export async function DELETE(req: NextRequest) {
  const burst = rateLimit(limitKey("push-unsub", req), 10, 60_000)
  if (!burst.ok) return tooManyRequests(burst.retryAfterS)

  let body: SubscribeBody
  try {
    body = (await req.json()) as SubscribeBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim().slice(0, 2048) : ""
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 })

  await db.pushSub.deleteMany({ where: { endpoint } })
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
}
