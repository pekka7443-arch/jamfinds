/**
 * Server-side mod query helpers shared by /api/mods, /api/mods/[id] and
 * the /mod/[id] page. Handles the contentHash dedupe (Task 15):
 *
 *  - computeDuplicateIds(where): rows that share a contentHash but are NOT
 *    the newest publishedAt row of their group, evaluated over exactly the
 *    rows the given filter would show (so Requests isolation and category
 *    filters are never affected by hidden rows).
 *  - attachSources(items): when several sources carry the same mod, the
 *    surviving row gets `sources: SourceDef[]` listing every matching
 *    source (in SOURCE_DEFS registry order).
 */

import { db } from "@/lib/db"
import { SOURCE_DEFS } from "@/lib/sources"
import type { SourceDef } from "@/lib/sources"
import type { ModItem } from "@/lib/types"

export type ModWithSources = ModItem & { contentHash?: string | null; sources?: SourceDef[] }

type Where = Record<string, unknown>

interface HashRow {
  id: string
  contentHash: string | null
  publishedAt: Date
}

/**
 * IDs to exclude from a listing: every row whose contentHash group has a
 * NEWER row inside the same filtered set. Ties on publishedAt break to the
 * lexicographically smallest id so pagination is deterministic.
 */
export async function computeDuplicateIds(where: Where): Promise<string[]> {
  const rows: HashRow[] = await db.mod.findMany({
    where: { ...where, contentHash: { not: null } },
    select: { id: true, contentHash: true, publishedAt: true },
  })
  const newest = new Map<string, HashRow>()
  for (const r of rows) {
    const h = r.contentHash as string
    const cur = newest.get(h)
    if (
      !cur ||
      r.publishedAt.getTime() > cur.publishedAt.getTime() ||
      (r.publishedAt.getTime() === cur.publishedAt.getTime() && r.id < cur.id)
    ) {
      newest.set(h, r)
    }
  }
  const dupIds: string[] = []
  for (const r of rows) {
    if (newest.get(r.contentHash as string)!.id !== r.id) dupIds.push(r.id)
  }
  return dupIds
}

/**
 * Attach `sources` (registry SourceDefs) to each item whose contentHash is
 * carried by more than one source. Items without a hash (or single-source)
 * are returned untouched. Mutates the given objects and returns them.
 */
export async function attachSources<T extends { id: string; source: string; contentHash?: string | null }>(
  items: T[],
): Promise<(T & { sources?: SourceDef[] })[]> {
  const hashes = [...new Set(items.map((m) => m.contentHash).filter((h): h is string => Boolean(h)))]
  if (hashes.length === 0) return items

  const rows = await db.mod.findMany({
    where: { contentHash: { in: hashes } },
    select: { contentHash: true, source: true },
  })
  const byHash = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.contentHash) continue
    const set = byHash.get(r.contentHash) ?? new Set<string>()
    set.add(r.source)
    byHash.set(r.contentHash, set)
  }
  for (const item of items) {
    const set = item.contentHash ? byHash.get(item.contentHash) : undefined
    if (set && set.size > 1) {
      (item as T & { sources?: SourceDef[] }).sources = SOURCE_DEFS.filter((d) => set.has(d.key))
    }
  }
  return items as (T & { sources?: SourceDef[] })[]
}

/** Wire shape for a single mod: DB row with ISO date strings (ModItem). */
export function serializeMod(
  row: Record<string, unknown> & { publishedAt: Date; firstSeenAt: Date; updatedAt: Date },
): ModItem {
  return {
    ...row,
    publishedAt: row.publishedAt.toISOString(),
    firstSeenAt: row.firstSeenAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as unknown as ModItem
}

/** Fetch one mod by id with its multi-source list attached. Null when absent. */
export async function getModWithSources(id: string): Promise<ModWithSources | null> {
  const mod = await db.mod.findUnique({ where: { id } })
  if (!mod) return null
  const [withSources] = await attachSources([mod])
  return serializeMod(withSources) as ModWithSources
}
