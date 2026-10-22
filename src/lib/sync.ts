/**
 * Multi-source -> DB sync engine.
 *
 * Sources (see src/lib/sources.ts):
 *  - 4 subreddits polled via /new/.rss feeds (src/lib/reddit.ts)
 *  - BeamFinds via its public JSON API + BeamFree via HTML scrape (src/lib/scrapers.ts)
 *
 * Behavior:
 *  - Upserts entries into the Mod table (preserving firstSeenAt AND the oldest
 *    publishedAt, so scraped entries without real timestamps never drift)
 *  - Runs a background interval so the site stays fresh without visitors
 *  - Exponential backoff on 429s / total failures
 *  - Single-flight lock so overlapping requests don't double-sync
 */

import { db } from "@/lib/db"
import { fetchSubredditFeed, htmlToText } from "@/lib/reddit"
import {
  fetchBeamfinds,
  fetchBeamfindsFull,
  fetchBeamfindsTotal,
  fetchBeamfree,
  type NormalizedEntry,
} from "@/lib/scrapers"
import { cleanTitle, extractLinks, hasDownloadLink, inferCategory } from "@/lib/links"
import { SOURCE_DEFS, SOURCES } from "@/lib/sources"

export { SOURCES }

const SYNC_INTERVAL_MS = 60_000 // aim: every minute
const FETCH_GAP_WEB_MS = 1_200 // gap between web-source fetches
const FETCH_GAP_REDDIT_MS = 4_500 // generous gap between subs — Reddit 429s fast
const WEB_SOURCE_MIN_INTERVAL_MS = 180_000 // web sites update slowly; be gentle
const REDDIT_PER_CYCLE = 2 // round-robin subs per cycle — halves 429 pressure
const BACKOFF_STEPS_MS = [60_000, 120_000, 300_000, 600_000]
const MAX_PER_FEED = 100

interface SyncInternals {
  running: boolean
  consecutiveFailures: number
  timer: NodeJS.Timeout | null
  started: boolean
  gen?: symbol // module generation that owns the current timer
  lastWebFetch?: Record<string, number> // per web-source last fetch (ms epoch)
  redditCursor?: number // round-robin position across subreddits
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

/**
 * Map a source's own category label to our taxonomy.
 * Covers BeamFree chips ("Map", "Cars", "Semis"...) and the full BeamFinds
 * vocabulary ("IRL Vehicle", "Fictional Vehicle", "Parts", "Config",
 * "Sound Mod", "UI", "Other", legacy "vehicles").
 */
function hintToCategory(hint?: string): string | null {
  if (!hint) return null
  const h = hint.toLowerCase()
  if (/\bmap\b|terrain|\btrack\b|location/.test(h)) return "map"
  if (/\bcar\b|vehicle|\bsedan\b|\bcoupe\b|\bsuv\b|\btruck\b|\bsemi\b|\bbus\b|\bbike\b|motorcycle/.test(h)) return "vehicle"
  if (/skin|livery|paint|texture/.test(h)) return "skin"
  if (/part|tuning|engine|wheel|config/.test(h)) return "parts"
  if (/sound|audio/.test(h)) return "other"
  if (/\bui\b|interface|\bhud\b/.test(h)) return "other"
  if (/\bother\b|\bmisc\b/.test(h)) return "other"
  return null
}

/** Google Drive file links give us a free preview image via lh3.googleusercontent. */
function gdriveThumbFromLinks(links: { url: string; host: string }[]): string | null {
  const g = links.find((l) => l.host === "gdrive" && /\/file\/d\/([A-Za-z0-9_-]{10,})/.test(l.url))
  const id = g?.url.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/)?.[1]
  return id ? `https://lh3.googleusercontent.com/d/${id}=w400` : null
}

type NormalizedRow = NormalizedEntry & {
  category: string
  hasLinks: boolean
  rawTitle: string
}

/** Normalize a raw entry: clean title, extract links, infer category. */
function normalize(entry: NormalizedEntry): NormalizedRow {
  const isReddit = entry.id.startsWith("t3_")
  const text = entry.text.slice(0, 4000)
  const links =
    entry.links.length > 0
      ? entry.links
      : extractLinks(entry.title, text).filter(
          (l) => !/https?:\/\/(?:[\w-]+\.)*(?:reddit\.com|redd\.it)\//i.test(l.url),
        )
  const rawTitle = entry.title
  const title = (isReddit ? cleanTitle(entry.title) || entry.title : entry.title).slice(0, 300)
  const inferred = inferCategory(title, text, links.length > 0)
  // Source-provided categories are authoritative (BeamFinds' own taxonomy,
  // BeamFree chips) and beat inference — title/body heuristics only apply
  // when the source doesn't categorize. Web-source catalogs contain real
  // downloadable mods, never request posts, so hints cannot misfile rows.
  const hinted = hintToCategory(entry.catHint)
  let category = hinted ?? inferred
  // Task 8: the download categories promise WORKING mods. A post with no
  // real download link (showcase-only, Patreon/Ko-fi/YouTube/Discord-invite
  // pages) gets its own bucket instead of sitting among Vehicles/Maps/etc.
  // Requests and Info are unaffected — they never promised a download.
  if (
    category === "vehicle" ||
    category === "map" ||
    category === "skin" ||
    category === "parts" ||
    category === "other"
  ) {
    if (!hasDownloadLink(links)) category = "no-link"
  }
  const thumbnail =
    entry.thumbnail ?? (entry.images.length === 0 ? gdriveThumbFromLinks(links) : null)
  return {
    ...entry,
    title,
    rawTitle: rawTitle.slice(0, 300),
    text,
    links,
    thumbnail,
    hasLinks: links.length > 0,
    category,
  }
}

async function upsertEntry(entry: NormalizedEntry): Promise<"insert" | "update"> {
  const n = normalize(entry)
  if (isNaN(n.publishedAt.getTime())) n.publishedAt = new Date()
  const data = {
    source: n.source,
    title: n.title,
    rawTitle: n.rawTitle,
    author: n.author,
    permalink: n.permalink,
    text: n.text,
    thumbnail: n.thumbnail,
    images: JSON.stringify(n.images),
    links: JSON.stringify(n.links),
    category: n.category,
    hasLinks: n.hasLinks,
  }

  const existing = await db.mod.findUnique({
    where: { id: entry.id },
    select: { id: true, publishedAt: true },
  })
  if (existing) {
    // Keep the oldest publishedAt — scraped listings have no timestamps and
    // would otherwise drift forward on every sync.
    const publishedAt =
      existing.publishedAt.getTime() <= n.publishedAt.getTime() ? existing.publishedAt : n.publishedAt
    await db.mod.update({ where: { id: entry.id }, data: { ...data, publishedAt } })
    return "update"
  }
  await db.mod.create({ data: { id: n.id, ...data, publishedAt: n.publishedAt } })
  return "insert"
}

/** Collect fresh entries from every source, with per-source error capture. */
async function fetchAllSources(): Promise<{ fetched: number; lastError?: string }> {
  let fetched = 0
  let lastError: string | undefined

  // Web sources first (reliable, Reddit-independent), then a rotating slice
  // of REDDIT_PER_CYCLE subreddits. Round-robin keeps per-minute request
  // pressure low enough that Reddit rarely answers 429.
  const webDefs = SOURCE_DEFS.filter((d) => d.kind === "web")
  const redditDefs = SOURCE_DEFS.filter((d) => d.kind === "reddit")
  const start = state.redditCursor ?? 0
  const slice = redditDefs
    .slice(start, start + REDDIT_PER_CYCLE)
    .concat(start + REDDIT_PER_CYCLE > redditDefs.length ? redditDefs.slice(0, (start + REDDIT_PER_CYCLE) % redditDefs.length) : [])
  state.redditCursor = (start + REDDIT_PER_CYCLE) % Math.max(1, redditDefs.length)
  const ordered = [...webDefs, ...slice]

  for (const def of ordered) {
    if (
      def.kind === "web" &&
      state.lastWebFetch?.[def.key] &&
      Date.now() - state.lastWebFetch[def.key] < WEB_SOURCE_MIN_INTERVAL_MS
    ) {
      continue // fetched recently — skip this cycle
    }
    try {
      let entries: NormalizedEntry[] = []
      if (def.kind === "reddit") {
        const feed = await fetchSubredditFeed(def.key, MAX_PER_FEED)
        entries = feed.map((e) => ({
          id: e.id,
          source: def.key,
          title: e.title,
          author: e.author,
          permalink: e.permalink,
          publishedAt: e.publishedAt,
          text: htmlToText(e.contentHtml),
          thumbnail: e.thumbnail,
          images: e.images,
          links: [],
        }))
      } else if (def.key === "BeamFinds") {
        // Full catalog sweep when our DB is meaningfully behind BeamFinds
        // (first run / long downtime), cheap newest-first top-up otherwise.
        // Quick mode still catches day-to-day uploads (50/page, newest first).
        const total = await fetchBeamfindsTotal()
        const have = await db.mod.count({ where: { source: "BeamFinds" } })
        entries =
          total != null && have < total - 10
            ? await fetchBeamfindsFull()
            : await fetchBeamfinds(2)
      } else if (def.key === "BeamFree") {
        entries = await fetchBeamfree()
      }
      fetched += entries.length
      if (def.kind === "web") {
        state.lastWebFetch = { ...(state.lastWebFetch ?? {}), [def.key]: Date.now() }
      }
      for (const entry of entries) {
        const kind = await upsertEntry(entry)
        if (kind === "insert") insertedCount++
        else updatedCount++
      }
    } catch (err) {
      lastError = `${def.label}: ${(err as Error).message}`
      if ((err as Error & { status?: number }).status === 429 && def.kind === "reddit") {
        break // stop the reddit portion this cycle; web sources already done
      }
    }
    await new Promise((r) => setTimeout(r, def.kind === "reddit" ? FETCH_GAP_REDDIT_MS : FETCH_GAP_WEB_MS))
  }
  return { fetched, lastError }
}

// simple counters shared with runSync (single-flight lock makes this safe)
let insertedCount = 0
let updatedCount = 0

async function runSync(force: boolean): Promise<SyncResult> {
  if (state.running) {
    return { ok: true, inserted: 0, updated: 0, fetched: 0, durationMs: 0, error: "sync-already-running" }
  }
  state.running = true
  insertedCount = 0
  updatedCount = 0
  const startedAt = Date.now()

  try {
    // Check backoff unless forced
    if (!force) {
      const st = await db.syncState.findUnique({ where: { id: "global" } })
      if (st?.backoffUntil && st.backoffUntil.getTime() > Date.now()) {
        return { ok: false, inserted: 0, updated: 0, fetched: 0, durationMs: 0, error: "backing-off" }
      }
    }

    const { fetched, lastError } = await fetchAllSources()
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
      return { ok: false, inserted: 0, updated: 0, fetched, durationMs, error: lastError }
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
    return { ok: true, inserted: insertedCount, updated: updatedCount, fetched, durationMs }
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

/** Start the background sync loop (idempotent, HMR-safe). */
export function startSyncLoop(): void {
  // After an HMR reload this module is a fresh generation: if an older
  // generation still owns the interval, replace it with current code.
  const gen = startSyncLoopSymbol
  if (state.timer && state.gen !== gen) {
    clearInterval(state.timer)
    state.timer = null
  }
  state.gen = gen
  if (!state.started) {
    state.started = true
    // First sync shortly after boot
    setTimeout(() => void ensureSync(0), 1500)
  }
  if (!state.timer) {
    state.timer = setInterval(() => void ensureSync(SYNC_INTERVAL_MS), SYNC_INTERVAL_MS)
    if (state.timer.unref) state.timer.unref()
  }
}

// New symbol identity on every module evaluation (HMR reload detector).
const startSyncLoopSymbol = Symbol("jamSyncGen")

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
