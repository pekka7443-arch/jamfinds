# Worklog

---
Task ID: 1
Agent: main (Z.ai)
Task: Build "JamFinds" — a live Jamaica BeamNG mod finder site like beamfinds.com, auto-syncing mods from Reddit (r/Beamng_Jamaica) with realtime updates and auto-decoded base64 download links.

Work Log:
- Researched beamfinds.com (card-based mod hub: stats bar, category filters, trending/recent sections).
- Reddit JSON API is blocked (403) from sandbox; discovered the official RSS feed (https://www.reddit.com/r/{sub}/new/.rss) works with a browser UA → chosen as the sync source.
- Initialized fullstack Next.js 16 environment via init script.
- Discovered Reddit sub names are case-insensitive: r/Beamng_Jamaica == r/BeamNG_Jamaica (same sub). Single canonical source.
- Prisma schema: Mod (id=t3_id, source, title/rawTitle, author, permalink, text, thumbnail, images JSON, links JSON, category, hasLinks, publishedAt, firstSeenAt) + SyncState. Pushed to SQLite.
- src/lib/reddit.ts: Atom/RSS fetcher + parser (entries, media:thumbnail, inline redd.it images, entity decoding, block-page detection).
- src/lib/links.ts: base64 URL decoder (mods links come base64-encoded in titles/bodies!), plain URL extractor, host classifier (Modsfire/Mediafire/GDrive/Discord/MEGA...), title cleaner, category inference (vehicle/map/skin/parts/request/info/other).
- src/lib/sync.ts: sync engine — 60s background loop (globalThis-safe against HMR), single-flight lock, exponential backoff on 429/block pages (60s→600s), stale-while-revalidate ensureSync, forceSync for manual refresh.
- API: GET /api/mods (q/cat/source/withLinks/sort/page filters + stats + sync meta), POST /api/sync (force refresh).
- UI: dark Jamaica theme (green #009B3A / gold #FED100 accents, flag strip), sticky header with LIVE pulse badge + sync status + search + Refresh, hero with 4 stat cards, category chips + "Ready to download" switch + subreddit/sort selects, mod card grid (thumbnails, NEW badge, host badges with 🔓 decoded marker, author/relative time), detail Dialog (decoded links with Copy/Open, images, body text, Open on Reddit), footer with disclaimer. TanStack Query useInfiniteQuery polling every 20s, new-mod toast + gold "fresh" glow, relative times auto-update.
- Fixed during QA: missing component file, non-async onSuccess await, client/server module split (Buffer in links.ts unsafe for client → moved hostStyle/CATEGORIES into types.ts), reddit permalink boilerplate polluting links (filtered reddit.com/redd.it URLs → categories improved: 59 vehicle/21 request/3 parts/1 map/16 other, 41 with real links), ref-during-render + setState-in-effect lint errors.
- Verified via agent-browser: home render, dialog decode (title base64 → https://modsfire.com/B6294i44Dq2Gf4h), copy button, search ("porsche" → 4), filters (Requests → 21, withLinks → 24/page), sort A→Z, Load more (24→48), mobile 390px layout, sticky footer, zero console errors, background loop auto-synced 10x.

Stage Summary:
- Deliverable: runnable Next.js 16 site (single `/` route + /api/mods + /api/sync), dark Jamaica-themed live mod finder.
- Realtime chain: Reddit RSS → 60s server sync loop → SQLite → client 20s polling → toast + gold glow on new mods.
- Key insight: sub shares mods as base64 codes; site auto-decodes them — differentiator vs plain aggregators.
- Sources configurable via SOURCES array in src/lib/sync.ts.
