import { NextResponse } from "next/server"
import { getModWithSources } from "@/lib/mod-queries"

export const dynamic = "force-dynamic"

/**
 * Single mod by id — backs the /mod/[id] page and shareable deep links.
 * Returns { mod } where mod.sources lists every source catalog that carries
 * the same contentHash (present only when > 1). Any category is fetchable
 * by id — shareable links must always resolve, even for request posts.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const mod = await getModWithSources(id)
  if (!mod) {
    return NextResponse.json({ error: "Mod not found" }, { status: 404, headers: { "Cache-Control": "no-store" } })
  }
  return NextResponse.json({ mod }, { headers: { "Cache-Control": "no-store" } })
}
