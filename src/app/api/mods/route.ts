import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ensureSync, startSyncLoop, SOURCES } from "@/lib/sync"

export const dynamic = "force-dynamic"

const PAGE_SIZE_DEFAULT = 24

export async function GET(req: NextRequest) {
  startSyncLoop() // idempotent; guarantees background loop is alive
  void ensureSync(60_000) // stale-while-revalidate: kick off sync if older than 60s

  const sp = req.nextUrl.searchParams
  const q = (sp.get("q") ?? "").trim()
  const cat = sp.get("cat") ?? "all"
  const source = sp.get("source") ?? "all"
  const withLinks = sp.get("withLinks") === "1"
  const sort = sp.get("sort") ?? "new"
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1)
  const limit = Math.min(60, Math.max(6, Number(sp.get("limit") ?? String(PAGE_SIZE_DEFAULT)) || PAGE_SIZE_DEFAULT))

  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [{ title: { contains: q } }, { text: { contains: q } }, { author: { contains: q } }]
  }
  if (cat && cat !== "all") where.category = cat
  if (source && source !== "all") where.source = source
  if (withLinks) where.hasLinks = true

  const orderBy =
    sort === "old" ? { publishedAt: "asc" as const } : sort === "az" ? { title: "asc" as const } : { publishedAt: "desc" as const }

  const [mods, total, totalCount, freshCount, linkCount, syncState, sourcesAgg] = await Promise.all([
    db.mod.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit + 1, // peek to compute hasMore
    }),
    db.mod.count({ where }),
    db.mod.count(),
    db.mod.count({ where: { publishedAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
    db.mod.count({ where: { hasLinks: true } }),
    db.syncState.findUnique({ where: { id: "global" } }),
    db.mod.groupBy({ by: ["source"], _count: { _all: true } }),
  ])

  const hasMore = mods.length > limit
  const items = mods.slice(0, limit)

  const stats = {
    total: totalCount,
    fresh24h: freshCount,
    withLinks: linkCount,
    sources: sourcesAgg.map((s) => ({ name: s.source, count: s._count._all })),
  }

  return NextResponse.json(
    {
      mods: items,
      total,
      page,
      hasMore,
      stats,
      sources: [...SOURCES],
      sync: {
        lastSyncAt: syncState?.lastSyncAt ?? null,
        lastResult: syncState?.lastResult ?? null,
        lastError: syncState?.lastError ?? null,
        syncCount: syncState?.syncCount ?? 0,
      },
      serverNow: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
