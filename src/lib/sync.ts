/**
 * Reddit -> DB sync engine.
 *
 * - Polls every source subreddit's /new/.rss feed
 * - Upserts entries into the Mod table (preserving firstSeenAt)
 * - Runs a background interval so the site stays fresh without visitors
 * - Exponential backoff on 429s / failures
 * - Single-flight lock so overlapping requests don't double-sync
 */

import { db } from "@/lib/db"
import { fetchSubredditFeed, htmlToText, type FeedEntry } from "@/lib/reddit"
import { cleanTitle, extractLinks, inferCategory } from "@/lib/links"

/**
 * Source subreddits polled for mods. Reddit sub names are case-insensitive,
 * so they are normalized + deduped here. Add more subs to this array and the
 * sync engine picks them up automatically.
 */
export const SOURCES = [...new Set(["Beamng_Jamaica"].map((s) => s.toLowerCase()))].map(
  (s) => s.charAt(0).toUpperCase() + s.slice(1),
) as string[]

const SYNC_INTERVAL_MS = 60_000 // aim: every minute
const FETCH_GAP_MS = 4_000 // gap between source fetches
const BACKOFF_STEPS_MS = [60_000, 120_000, 300_000, 600_000]
const MAX_PER_FEED = 100

interface SyncInternals {
  running: boolean
  consecutiveFailures: number
  timer: NodeJS.Timeout | null
  started: boolean
}

// Survive Next.js HMR module reloads
const g = globalThis as unknown as { __jamSync?: SyncInternals }
const state: SyncInternals =
  g.__jamSync ?? (g.__jamSync = { running: false, consecutiveFailures: 0, timer: null, started: false })

export interface SyncResult {
  ok: boolean
  inserted: number
  updated: number
  fetched: number
  durationMs: number
  error?: string
}

async function upsertEntry(entry: FeedEntry): Promise<"insert" | "update"> {
  const text = htmlToText(entry.contentHtml).slice(0, 4000)
  // Ignore reddit-internal URLs (permalinks/images) — they are not download links
  const links = extractLinks(entry.title, text).filter(
    (l) => !/https?:\/\/(?:[\w-]+\.)*(?:reddit\.com|redd\.it)\//i.test(l.url),
  )
  const title = cleanTitle(entry.title) || entry.title
  const hasLinks = links.length > 0
  const category = inferCategory(title, text, hasLinks)

  const data = {
    source: entry.source,
    title: title.slice(0, 300),
    rawTitle: entry.title.slice(0, 300),
    author: entry.author,
    permalink: entry.permalink,
    text,
    thumbnail: entry.thumbnail,
    images: JSON.stringify(entry.images),
    links: JSON.stringify(links),
    category,
    hasLinks,
    publishedAt: entry.publishedAt,
  }

  const existing = await db.mod.findUnique({ where: { id: entry.id }, select: { id: true } })
  if (existing) {
    await db.mod.update({ where: { id: entry.id }, data })
    return "update"
  } else {
    await db.mod.create({ data: { id: entry.id, ...data } })
    return "insert"
  }
}

async function runSync(force: boolean): Promise<SyncResult> {
  if (state.running) {
    return { ok: true, inserted: 0, updated: 0, fetched: 0, durationMs: 0, error: "sync-already-running" }
  }
  state.running = true
  const startedAt = Date.now()
  let inserted = 0
  let updated = 0
  let fetched = 0
  let lastError: string | undefined

  try {
    // Check backoff unless forced
    if (!force) {
      const st = await db.syncState.findUnique({ where: { id: "global" } })
      if (st?.backoffUntil && st.backoffUntil.getTime() > Date.now()) {
        state.running = false
        return { ok: false, inserted: 0, updated: 0, fetched: 0, durationMs: 0, error: "backing-off" }
      }
    }

    for (const sub of SOURCES) {
      try {
        const entries = await fetchSubredditFeed(sub, MAX_PER_FEED)
        fetched += entries.length
        for (const entry of entries) {
          const kind = await upsertEntry(entry)
          if (kind === "insert") inserted++
          else updated++
        }
      } catch (err) {
        lastError = (err as Error).message
        if ((err as Error & { status?: number }).status === 429) break // stop hammering
      }
      await new Promise((r) => setTimeout(r, FETCH_GAP_MS))
    }

    const durationMs = Date.now() - startedAt
    const anyFetchError = Boolean(lastError)
    const partialSuccess = fetched > 0

    if (fetched === 0 && anyFetchError) {
      // full failure -> backoff
      const step = Math.min(state.consecutiveFailures, BACKOFF_STEPS_MS.length - 1)
      const backoffMs = BACKOFF_STEPS_MS[step]
      state.consecutiveFailures++
      await db.syncState.upsert({
        where: { id: "global" },
        create: {
          id: "global",
          lastSyncAt: new Date(startedAt),
          lastResult: "error",
          lastError,
          lastSyncedMs: durationMs,
          syncCount: 1,
          totalSeen: 0,
          backoffUntil: new Date(Date.now() + backoffMs),
        },
        update: {
          lastSyncAt: new Date(startedAt),
          lastResult: "error",
          lastError,
          lastSyncedMs: durationMs,
          syncCount: { increment: 1 },
          backoffUntil: new Date(Date.now() + backoffMs),
        },
      })
      return { ok: false, inserted, updated, fetched, durationMs, error: lastError }
    }

    // success (or partial)
    state.consecutiveFailures = 0
    await db.syncState.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        lastSyncAt: new Date(startedAt),
        lastResult: partialSuccess && lastError ? "partial" : "ok",
        lastError: lastError ?? null,
        lastSyncedMs: durationMs,
        syncCount: 1,
        totalSeen: fetched,
      },
      update: {
        lastSyncAt: new Date(startedAt),
        lastResult: partialSuccess && lastError ? "partial" : "ok",
        lastError: lastError ?? null,
        lastSyncedMs: durationMs,
        syncCount: { increment: 1 },
        totalSeen: { increment: fetched },
        backoffUntil: null,
      },
    })
    return { ok: true, inserted, updated, fetched, durationMs }
  } finally {
    state.running = false
  }
}

/**
 * Trigger a sync if the last one is stale. Never throws.
 * Called from API routes (stale-while-revalidate) and the background loop.
 */
export async function ensureSync(maxAgeMs = SYNC_INTERVAL_MS, force = false): Promise<void> {
  try {
    const st = await db.syncState.findUnique({ where: { id: "global" } })
    const age = st?.lastSyncAt ? Date.now() - st.lastSyncAt.getTime() : Infinity
    if (!force && age < maxAgeMs) return
    if (force && state.running) return
    // fire and forget
    void runSync(force).catch(() => {})
  } catch {
    // ignore
  }
}

/** Start the background sync loop (idempotent across HMR). */
export function startSyncLoop(): void {
  if (state.started) return
  state.started = true
  // First sync shortly after boot, then every interval
  setTimeout(() => void ensureSync(0), 1500)
  state.timer = setInterval(() => void ensureSync(SYNC_INTERVAL_MS), SYNC_INTERVAL_MS)
  if (state.timer.unref) state.timer.unref()
}

export function isSyncRunning(): boolean {
  return state.running
}

/** Force a sync and wait for it (used by the manual refresh button). */
export async function forceSync(): Promise<SyncResult> {
  try {
    return await runSync(true)
  } catch (err) {
    return { ok: false, inserted: 0, updated: 0, fetched: 0, durationMs: 0, error: (err as Error).message }
  }
}
