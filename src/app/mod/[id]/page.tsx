import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getModWithSources } from "@/lib/mod-queries"
import { BRAND } from "@/lib/brand"
import { ModDetailsHeader, ModDetailsRest, ModMeta } from "@/components/site/mod-details"
import { Footer } from "@/components/site/footer"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

async function fetchMod(id: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  return getModWithSources(id)
}

/**
 * OG metadata for shareable /mod/[id] links: title, description, and the
 * mod's thumbnail as og:image so Discord/Reddit/iMessage unfurls show the
 * actual mod art.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const mod = await fetchMod(id)
  if (!mod) return { title: `Mod not found — ${BRAND.name}` }

  const title = mod.title
  const description =
    mod.text.replace(/\s+/g, " ").trim().slice(0, 180) ||
    `${mod.category.replace("-", " ")} mod for BeamNG.drive, synced live from ${mod.source}.`
  const canonical = `/mod/${id}`
  const thumbnail = mod.thumbnail ?? (JSON.parse(mod.images || "[]") as string[])[0] ?? null

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: BRAND.name,
      type: "article",
      images: thumbnail ? [{ url: thumbnail }] : undefined,
    },
    twitter: {
      card: thumbnail ? "summary_large_image" : "summary",
      title,
      description,
      images: thumbnail ? [thumbnail] : undefined,
    },
  }
}

export default async function ModPage({ params }: PageProps) {
  const { id } = await params
  const mod = await fetchMod(id)
  if (!mod) notFound()

  // Canonicalization: when a NEWER row carries the same contentHash this
  // page is a duplicate — send humans and crawlers to the canonical one.
  if (mod.contentHash) {
    const newest = await db.mod.findFirst({
      where: { contentHash: mod.contentHash },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      select: { id: true },
    })
    if (newest && newest.id !== id) redirect(`/mod/${newest.id}`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Slim server-rendered top bar (the live header stays homepage-only) */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2.5 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="JamFinds home">
            <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
              <rect width="64" height="64" rx="14" fill="#141220" />
              <path d="M17 41a19 19 0 0 1 30-15" stroke="#8B5CF6" strokeWidth="4.5" fill="none" strokeLinecap="round" opacity="0.45" />
              <path d="M23 42a12.5 12.5 0 0 1 20-9.5" stroke="#A78BFA" strokeWidth="4.5" fill="none" strokeLinecap="round" opacity="0.9" />
              <circle cx="43.5" cy="22" r="5.5" fill="#C4B5FD" />
            </svg>
            <span className="font-[family-name:var(--font-display)] text-lg tracking-tight">
              <span className="text-foreground">Jam</span>
              <span className="text-gradient-brand">Finds</span>
            </span>
          </Link>
          <Link
            href="/"
            className="rounded-md border border-border bg-secondary/60 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:border-primary/40 hover:text-primary"
          >
            ← Back to live finds
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <article
          aria-label={`Mod: ${mod.title}`}
          className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-popover p-5 shadow-lg sm:p-6"
        >
          <ModDetailsHeader
            mod={mod}
            titleSlot={<h1 className="tt-h2 pr-6 text-left text-xl leading-snug sm:text-2xl">{mod.title}</h1>}
            metaSlot={
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <ModMeta mod={mod} />
              </div>
            }
          />
          <ModDetailsRest mod={mod} />
        </article>
      </main>

      <Footer />
    </div>
  )
}
