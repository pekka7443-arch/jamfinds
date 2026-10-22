/**
 * BeamFree catalog backfill — imports the exact listings the user asked for:
 *
 *   /mods?page=1..24                       (full index, newest first)
 *   /mods?category=uploads&page=1..17      (uploads category)
 *   /mods?category=maps&page=1..3          (maps category; page 1 = no param)
 *
 * Compliance (checked up front, 2026-10-22):
 *   - robots.txt: "User-agent: *  Allow: /" with /api/ disallowed → we only
 *     ever request public HTML listing/detail pages, never API endpoints.
 *   - Terms forbid "scraping that harms the service" → bounded concurrency,
 *     real inter-request gaps, retries with backoff, hard timeouts, and a
 *     hard stop on repeated 429s. ~1 request/second worst case.
 *   - Only public listing/detail metadata + hotlinked thumbnails are stored;
 *     every mod links back to its original beamfree.pro page (no file
 *     mirroring, no use of the JS-gated /dl/ endpoint).
 *
 * Resumable & rerun-safe:
 *   - Listing upserts are idempotent (same stable id `free-{N}`, canonical
 *     source URL /mod/{N}); rows already enriched are never regressed.
 *   - Detail enrichment keeps a JSONL checkpoint so an interrupted run
 *     continues where it stopped.
 *
 * Usage:
 *   NODE_ENV=production bun scripts/beamfree-import.ts                 # everything
 *   NODE_ENV=production bun scripts/beamfree-import.ts --skip-details  # listings only
 *   NODE_ENV=production bun scripts/beamfree-import.ts --details-only  # enrichment only
 *   ... --max-details=50                                               # smoke-test cap
 */

import { db } from "../src/lib/db"
import {
  fetchBeamfreeDetail,
  fetchBeamfreePage,
  parseBeamfreeCards,
  type NormalizedEntry,
} from "../src/lib/scrapers"
import { upsertEntries } from "../src/lib/sync"
import { appendFileSync, existsSync, readFileSync } from "node:fs"

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const BASE = "https://beamfree.pro"
const LISTING_GAP_MS = 1_100 // gap between listing-page fetches
const DETAIL_GAP_MS = 650 // per-worker gap between detail fetches
const DETAIL_CONCURRENCY = 2 // bounded concurrency for the detail pass
const MAX_DETAIL_PAGES = 800 // runaway guard
const CHECKPOINT = new URL("./beamfree-details.done.jsonl", import.meta.url).pathname

/** The user-specified page ranges (page 1 included — dedupe makes it free,
 * and /mods?page=1 is the authoritative "newest" page the homepage only
 * samples). Out-of-range pages clamp server-side, so ranges stop at the
 * numbers the user gave. */
function listingPages(): { url: string; group: string }[] {
  const pages: { url: string; group: string }[] = []
  for (let p = 1; p <= 24; p++) pages.push({ url: `${BASE}/mods?page=${p}`, group: "mods" })
  for (let p = 1; p <= 17; p++)
    pages.push({ url: `${BASE}/mods?category=uploads&page=${p}`, group: "uploads" })
  pages.push({ url: `${BASE}/mods?category=maps`, group: "maps" })
  for (let p = 2; p <= 3; p++)
    pages.push({ url: `${BASE}/mods?category=maps&page=${p}`, group: "maps" })
  return pages
}

/* ------------------------------------------------------------------ */
/* Fetch with retry + backoff (respects 429, never hammers)            */
/* ------------------------------------------------------------------ */

let consecutive429 = 0

async function fetchWithRetry(url: string, what: string): Promise<string> {
  const backoffs = [1_000, 4_000, 12_000]
  let lastErr: unknown = null
  for (let attempt = 0; attempt < backoffs.length + 1; attempt++) {
    if (attempt > 0) {
      const is429 = String((lastErr as Error)?.message).includes("HTTP 429")
      await sleep(is429 ? backoffs[attempt - 1] * 3 : backoffs[attempt - 1])
    }
    try {
      const html = await fetchBeamfreePage(url)
      consecutive429 = 0
      return html
    } catch (err) {
      lastErr = err
      const msg = (err as Error).message
      if (msg.includes("HTTP 429")) {
        consecutive429++
        console.warn(`  429 on ${what} (attempt ${attempt + 1}), backing off…`)
        if (consecutive429 > 4) throw new Error("aborting: repeated 429s — rate limited")
      } else if (msg.includes("HTTP 404")) {
        throw err // permanent — do not retry
      }
    }
  }
  throw lastErr
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

const stats = {
  pagesAttempted: 0,
  pagesOk: 0,
  pagesFailed: [] as string[],
  cardsSeen: 0, // card instances across all pages
  discovered: new Set<string>(), // unique mod ids across all pages
  duplicatesAcrossPages: 0, // same id seen on more than one page (category overlap)
  inserted: 0,
  updated: 0,
  upsertErrors: 0,
  detailsAttempted: 0,
  detailsWithDescription: 0,
  detailsImagesUpdated: 0,
  detailsSkipped404: 0,
  detailsFailed: [] as string[],
}

/* ------------------------------------------------------------------ */
/* Phase 1 — listing pages                                             */
/* ------------------------------------------------------------------ */

async function importListings(): Promise<void> {
  console.log(`=== Phase 1: ${listingPages().length} listing pages ===`)
  for (const [idx, page] of listingPages().entries()) {
    stats.pagesAttempted++
    let cards: NormalizedEntry[] = []
    try {
      const html = await fetchWithRetry(page.url, page.url)
      cards = parseBeamfreeCards(html)
    } catch (err) {
      const msg = (err as Error).message
      stats.pagesFailed.push(`${page.url} (${msg})`)
      console.error(`  ✗ ${page.url}: ${msg}`)
      if (msg.startsWith("aborting:")) throw err
      await sleep(LISTING_GAP_MS)
      continue
    }

    stats.cardsSeen += cards.length
    for (const c of cards) {
      if (stats.discovered.has(c.id)) stats.duplicatesAcrossPages++
      else stats.discovered.add(c.id)
    }

    try {
      const { inserted, updated } = await upsertEntries(cards)
      stats.inserted += inserted
      stats.updated += updated
      stats.pagesOk++
      console.log(
        `  [${String(idx + 1).padStart(2, "0")}/${listingPages().length}] ${page.url.replace(BASE, "")} → ${cards.length} cards (+${inserted} new, ${updated} refreshed)`,
      )
    } catch (err) {
      stats.upsertErrors += cards.length
      stats.pagesFailed.push(`${page.url} (db: ${(err as Error).message})`)
      console.error(`  ✗ db upsert failed for ${page.url}: ${(err as Error).message}`)
    }
    await sleep(LISTING_GAP_MS)
  }
}

/* ------------------------------------------------------------------ */
/* Phase 2 — detail enrichment (descriptions + gallery images)         */
/* ------------------------------------------------------------------ */

function imgWidth(url: string): number {
  return Number(/[?&]w=(\d+)/.exec(url)?.[1] ?? 0)
}

function mergeImages(oldImgs: string[], newImgs: string[], cap = 12): string[] {
  const byBase = new Map<string, string>()
  for (const u of [...oldImgs, ...newImgs]) {
    if (!/^https:\/\/beamfree\.pro\/i\//.test(u)) continue // untrusted URLs never stored
    const base = u.split("?")[0]
    const prev = byBase.get(base)
    if (!prev || imgWidth(u) > imgWidth(prev)) byBase.set(base, u)
  }
  return [...byBase.values()].slice(0, cap)
}

interface CheckpointRow {
  id: string
  ok: boolean
  desc: number
  imgs: number
  err?: string
  at: string
}

function loadCheckpoint(): Map<string, CheckpointRow> {
  const map = new Map<string, CheckpointRow>()
  if (!existsSync(CHECKPOINT)) return map
  for (const line of readFileSync(CHECKPOINT, "utf-8").split("\n")) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line) as CheckpointRow
      map.set(row.id, row)
    } catch {
      // torn last line after a crash — ignore
    }
  }
  return map
}

function recordCheckpoint(row: CheckpointRow): void {
  appendFileSync(CHECKPOINT, JSON.stringify(row) + "\n")
}

async function enrichDetails(maxDetails: number): Promise<void> {
  const done = loadCheckpoint()
  const rows = await db.mod.findMany({
    where: { source: "BeamFree" },
    select: { id: true, text: true, images: true },
    orderBy: { id: "asc" },
  })
  const todo = rows.filter((r) => !done.has(r.id)).slice(0, Math.min(maxDetails, MAX_DETAIL_PAGES))
  console.log(
    `=== Phase 2: detail enrichment — ${todo.length} of ${rows.length} BeamFree rows (${done.size} already checkpointed) ===`,
  )
  if (todo.length === 0) return

  let cursor = 0
  const worker = async (workerId: number): Promise<void> => {
    while (true) {
      const i = cursor++
      if (i >= todo.length || i >= MAX_DETAIL_PAGES) return
      const row = todo[i]
      const numId = row.id.replace(/\D/g, "")
      stats.detailsAttempted++
      try {
        const detail = await fetchBeamfreeDetail(numId)
        const oldImages: string[] = JSON.parse(row.images ?? "[]")
        const data: { text?: string; images?: string } = {}

        if (detail.description && !row.text.includes(detail.description.slice(0, 120))) {
          data.text = [detail.description, row.text].filter(Boolean).join("\n\n").slice(0, 4000)
        }
        const mergedImages = mergeImages(oldImages, detail.images)
        if (mergedImages.length !== oldImages.length || mergedImages.some((u, k) => u !== oldImages[k])) {
          data.images = JSON.stringify(mergedImages)
        }

        if (Object.keys(data).length > 0) await db.mod.update({ where: { id: row.id }, data })
        if (detail.description) stats.detailsWithDescription++
        if (data.images) stats.detailsImagesUpdated++
        recordCheckpoint({
          id: row.id,
          ok: true,
          desc: detail.description?.length ?? 0,
          imgs: mergedImages.length,
          at: new Date().toISOString(),
        })
        if (stats.detailsAttempted % 25 === 0)
          console.log(
            `  … ${stats.detailsAttempted}/${todo.length} details fetched (${stats.detailsWithDescription} with description)`,
          )
      } catch (err) {
        const msg = (err as Error).message
        if (msg.includes("HTTP 404")) {
          // permanent: mod deleted upstream — listing data stays, no detail exists
          stats.detailsSkipped404++
          recordCheckpoint({
            id: row.id,
            ok: false,
            desc: 0,
            imgs: 0,
            err: "HTTP 404",
            at: new Date().toISOString(),
          })
        } else if (msg.startsWith("aborting:")) {
          console.error(`  ${msg} — stopping detail pass (rerun to resume)`)
          throw err
        } else {
          // transient — leave un-checkpointed so a rerun retries it
          stats.detailsFailed.push(`${row.id} (${msg})`)
          console.error(`  ✗ detail ${row.id}: ${msg}`)
        }
      }
      await sleep(DETAIL_GAP_MS * (workerId === 0 ? 1 : 1.4)) // slight worker desync
    }
  }

  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, (_, w) => worker(w)))
}

/* ------------------------------------------------------------------ */
/* Phase 3 — coverage cross-check against the published sitemap        */
/* ------------------------------------------------------------------ */

async function coverageReport(): Promise<void> {
  console.log("=== Phase 3: coverage cross-check vs sitemap.xml ===")
  let sitemapIds: number[] = []
  try {
    const xml = await fetchBeamfreePage(`${BASE}/sitemap.xml`)
    sitemapIds = [...xml.matchAll(/beamfree\.pro\/mod\/(\d+)</g)].map((m) => Number(m[1]))
    sitemapIds = [...new Set(sitemapIds)]
  } catch (err) {
    console.error(`  sitemap unreachable: ${(err as Error).message}`)
  }

  const rows = await db.mod.findMany({
    where: { source: "BeamFree" },
    select: { id: true, category: true, title: true },
  })
  const dbIds = new Set(rows.map((r) => Number(r.id.replace(/\D/g, ""))))

  if (sitemapIds.length > 0) {
    const missing = sitemapIds.filter((id) => !dbIds.has(id)).sort((a, b) => a - b)
    console.log(
      `  sitemap mods: ${sitemapIds.length} | in DB: ${sitemapIds.length - missing.length} | missing: ${missing.length}`,
    )
    if (missing.length > 0) console.log(`  missing ids: ${missing.slice(0, 40).join(", ")}${missing.length > 40 ? " …" : ""}`)
  }

  const byCat = new Map<string, number>()
  for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1)
  console.log(
    `  BeamFree rows in DB: ${rows.length} | by category: ${[...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join("  ")}`,
  )
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const args = process.argv.slice(2)
  const skipDetails = args.includes("--skip-details")
  const detailsOnly = args.includes("--details-only")
  const maxDetails = Number(args.find((a) => a.startsWith("--max-details="))?.split("=")[1] ?? Infinity)

  const t0 = Date.now()
  if (!detailsOnly) await importListings()
  if (!skipDetails) await enrichDetails(Number.isFinite(maxDetails) ? maxDetails : Infinity)
  await coverageReport()

  console.log("\n================= IMPORT SUMMARY =================")
  console.log(
    JSON.stringify(
      {
        pagesAttempted: stats.pagesAttempted,
        pagesOk: stats.pagesOk,
        pagesFailed: stats.pagesFailed.length,
        failedPageList: stats.pagesFailed,
        cardInstancesSeen: stats.cardsSeen,
        uniqueModsDiscovered: stats.discovered.size,
        duplicatesAcrossPages: stats.duplicatesAcrossPages,
        rowsInserted: stats.inserted,
        rowsUpdated: stats.updated,
        upsertErrors: stats.upsertErrors,
        detailPagesAttempted: stats.detailsAttempted,
        detailsWithDescription: stats.detailsWithDescription,
        detailsImagesUpdated: stats.detailsImagesUpdated,
        detailsSkipped404: stats.detailsSkipped404,
        detailsFailed: stats.detailsFailed,
        durationMs: Date.now() - t0,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((e) => {
    console.error(`IMPORT ABORTED: ${(e as Error).message}`)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
