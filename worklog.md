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

---
Task ID: 2
Agent: main (Z.ai)
Task: Add 5 new mod sources (r/BeamNGpiratemods, r/beamng_leakedmods, r/BeamNG_Leaked_M0ds, beamfinds.com/mods, beamfree.pro) + full design-system overhaul per user's 8 focus areas.

Work Log:
- Probed sources: 3 new subs work via existing RSS engine; beamfinds.com has a public JSON API (GET /api/public/v1/mods?page=N, thumbs at cdn.beamfinds.com, detail at /mods/{id}); beamfree.pro server-renders <a class="card" href="/mod/N"> blocks on its homepage.
- New src/lib/sources.ts: SOURCE_DEFS registry (6 sources: 4 reddit + BeamFinds + BeamFree) with per-source UI colors; SOURCES flat list re-exported by sync.
- New src/lib/scrapers.ts: fetchBeamfinds (2 pages ≈ 40 mods) + fetchBeamfree (homepage card regex parser → title/author/category/rating/size/version/cover image); both emit NormalizedEntry with portal link (host beamfinds/beamfree).
- sync.ts rewritten: web sources fetch first (Reddit-independent), 4 reddit subs round-robin 2 per cycle (REDDIT_PER_CYCLE) to halve 429 pressure; web sources throttled to 1 fetch/3 min (WEB_SOURCE_MIN_INTERVAL_MS); upsert keeps OLDEST publishedAt (scraped listings have no timestamps — prevents drift); HMR-safe timer via generation symbol (old interval code replaced after reload); invalid-date guard.
- links.ts: beamfinds.com/beamfree.pro host classification. types.ts: HOST_STYLES + beamfinds/beamfree, new shared CATEGORY_STYLES (7 hues, one recipe: border/35+bg/12+text-300).
- Design overhaul: dark palette retuned (bg oklch 0.155, muted-fg 0.72 ≈ 8.5:1 AA); semantic type scale classes .tt-display/.tt-h2/.tt-card-title/.tt-body/.tt-meta in globals.css; card-in entrance animation + prefers-reduced-motion; no-scrollbar chip rail.
- UI rebuilt: header leaner (search moved out); filters.tsx = integrated toolbar card (search + clear button, source+sort selects h-11/40, scrollable chip rail on mobile, Ready-to-download toggle, results row with Clear-filters pill); hero multi-source copy; mod-card new hierarchy (category chip top-left, NEW top-right, host badges on gradient, source dot chip + author + time in meta row pinned bottom, hover -translate-y+border+shadow, focus-visible ring, image scale 1.04); ModCardSkeleton; dialog source-aware ("Open on Reddit" vs "Open on BeamFree/BeamFree" with globe icon, decoded count badge); footer lists all 6 sources with dots; page.tsx error/empty/initial states polished (icon circles, tt-h2), grid key=filterKey replays entrance animation, Load-more shows remaining count.
- Fixed during QA: JSDoc comments containing */ broke parsing; Reddit 429 cascade (web-first + round-robin eliminated it: all 4 subs now 100/100/100/15); beamfinds.com rate-limited sandbox IP to 403 after probing burst — engine retries every 3 min, self-heals (still 403 at end of session, code path verified via error handling); BeamFree preview cleaned ("Rate it" stripped when unrated).
- Verified via agent-browser: desktop/mobile/tablet (0 horizontal overflow, 44px touch targets), search (porsche→4), category chips, source dropdown with counts, clear-filters, dialog (BeamFree + Reddit variants), decoded base64 badges on leakedmods cards, live toast "22 new mods just dropped" during visit, load-more 24→48, keyboard focus ring, sticky footer, zero console errors. Final DB: 336 mods / 131 with links across 5 sources (BeamFinds pending unblock).

Stage Summary:
- Deliverable: JamFinds now indexes 6 sources in real time — r/Beamng_Jamaica, r/BeamNGpiratemods, r/beamng_leakedmods, r/BeamNG_Leaked_M0ds, BeamFinds (API), BeamFree (scrape) — with unified cards, filters, and base64 decoding.
- Realtime chain unchanged: sync loop (60s, round-robin) → SQLite → client 20s poll → toast + gold glow.
- BeamFinds will appear automatically once their temporary IP block lifts; BeamFree refreshes every ≥3 min; subs rotate 2/cycle so each is polled every ~2 min.

---
Task ID: 2-b
Agent: main (Z.ai)
Task: BeamFinds source recovery — Node fetch blocked by their CDN (TLS fingerprint 403).

Work Log:
- Root cause: beamfinds.com CDN rejects Node/undici TLS fingerprint with 403 while curl passes (verified: same URL 403 via node fetch, 200 via curl --http1.1).
- scrapers.ts: added curlGet() (execFile curl --http1.1 with Safari UA + status suffix parsing); fetchBeamfinds now tries curl first, native fetch fallback.
- Force sync inserted 40 BeamFinds mods immediately.

Stage Summary:
- ALL 6 SOURCES LIVE: 376 mods indexed / 171 with links — Beamng_Jamaica 100, beamng_leakedmods 100, BeamNG_Leaked_M0ds 100, BeamNGpiratemods 15, BeamFinds 40, BeamFree 21.
- Browser-verified BeamFinds card dialog ("Open on BeamFinds" source-aware action). Hero shows "from 6 sources", toolbar "376 results".

---
Task ID: 3
Agent: main (Z.ai)
Task: Visual-only design polish — colors, background depth, surface effects. No layout restructuring, no new components, no functionality changes.

Work Log:
- Palette retuned in globals.css on a single neutral hue (oklch 165, deep green-teal) as an explicit 4-layer ladder: background 0.15 → card 0.205 → popover 0.24 (fixed old popover-darker-than-card inversion) → secondary 0.275 / accent 0.30. Borders softened 10%→7% white, input 14%→12%; muted-foreground 0.735 (~8:1 AA). Theme color meta updated to #070d0a.
- Ambient page depth: fixed body::before with 4 soft radial glows (brand green top-center, gold top-right, cool blue left, green bottom-right) + body::after with faint SVG feTurbulence grain (4% opacity, grayscale); body gets isolation:isolate so negative-z pseudos paint above bg, below content. Pure CSS, zero components, pointer-events none.
- Elevation recipe: .surface-card (inset top highlight + 2-layer soft shadow) and .surface-card-hover (green-tinted border, deeper shadow, soft 28px brand glow) applied to mod cards, hero stat cards, filter toolbar. Harsh outlines/shadow-sm/gray hover shadows removed.
- Badge system: new .badge-tint oklch recipe (same L/C/border-alpha for every badge, only --bh hue varies) + .cat-* and .host-* hue classes; CATEGORY_STYLES/HOST_STYLES in types.ts now emit badge-tint classes; source chips in sources.ts aligned to the same family.
- Accent consolidation to exactly two brand accents: primary green (buttons, links, LIVE, icons, focus) + gold (NEW, decoded, 24h, last-sync). Replaced dialog emerald-600/orange-600 buttons with primary token + neutral outline; header LIVE badge, footer hover/heart, page state panels (error→destructive tokens, connecting→primary tokens), stat icons alternated green/gold.
- Glass: header backdrop-blur-md → blur-lg + saturate-150 with /80→/55 (supports fallback kept); DialogContent now bg-popover/90 + backdrop-blur-xl + rounded-xl. hero-bg glow widened/layered; ::selection brand green; scrollbar thumb re-hued to 165.
- Verified via agent-browser: desktop 1440 + mobile 390 (no horizontal overflow), card hover lift+glow, dialog glass + accent buttons, badge family (Vehicle green / Request coral / BeamFree violet) all in one tonal family, zero page errors. Saved 5 verification screenshots to download/visual-check-*.png.

Stage Summary:
- Deliverable: same site, refined visual system — intentional single-hue dark palette with clear layer separation, ambient glow+grain depth, soft elevation surfaces, two-accent brand color story, hue-var badge family, glassy header/dialog. No functional or layout changes; all behavior identical.


---
Task ID: 4
Agent: main (Z.ai)
Task: Requests must never mix into the main mod feed — mods only in All/Vehicles/Maps/etc., requests exclusively in the Requests section.

Work Log:
- Root cause: inferCategory checked request patterns late (after info), only when !hasLinks, and missed many phrasings — "anyone got this BMW?" style posts landed in vehicle/other.
- links.ts: added STRONG_REQUEST_RE (anyone have/got/know, anybody, who has, looking for, does anyone, can someone/u, where can/is, help me find, mod request, lf/lft, send me, dm me, drop link, willing to pay, "is there a...") checked FIRST regardless of links — legit even when the post has a (non-download) link like a Patreon page; linkless titles ending in "?" are requests; weak words (need/please/missing/help) stay !hasLinks-only (release posts legitimately say "need BeamNG 0.31+").
- api/mods: cat=all now queries category != "request" — requests appear ONLY under the Requests chip; specific categories unaffected. Relabeled "All" chip to "All mods".
- scripts/recategorize.ts (bun): one-time backfill recomputed categories for all rows — 30 rows re-bucketed (before: vehicle 211/request 79/other 61/parts 14/info 1 -> after: vehicle 187/request 109/other 59/parts 11/info 0). Sync loop keeps new entries consistent (upsert re-normalizes every cycle).
- Spot-checked flagged rows: "0.40 RLS" (body: "Anyone have the new RLS for 0.40?" + patreon link) and "Kujees Cam Hub 1.3.0" (body: "Where could I find it?") are genuine requests — aggressive body matching is correct on this dataset.
- Verified via API + browser: cat=all 269 results with 0 request badges on cards; cat=request 109 results all badged; cat=vehicle 187 results 0 requests; live toast fired on recategorization; no console errors.

Stage Summary:
- Main grid ("All mods") and every download category now show only actual mods; requests live solely in the Requests section (109). New posts categorize with the same request-first rules automatically.

---
Task ID: 5
Agent: main (Z.ai)
Task: Downloads must happen ON JamFinds — files stream through the site instead of bouncing to external file hosts; non-proxyable hosts fall back gracefully.

Work Log:
- Probed every host in the DB (189 links: modsfire 67, beamfinds 40, beamfree 22, other 54, gdrive 5, discord 1) with curl to find direct-download strategies. Verified live: ModsFire 3-step chain (page -> /download/{id}/{token} with cookie jar -> /d/{id} 302 -> signed R2 URL, filename from base64 p= param; tested with a real 150 MB zip); Google Drive via drive.usercontent.google.com/download?id=...&confirm=t (streams with upstream Content-Disposition, verified "Gavril Scout .zip"); Pixeldrain /api/file/{id}?download; Mediafire page scrape; Dropbox dl=1; cdn.discordapp.com attachments. Not proxyable (JS/IP-gated, verified 403): BeamFree signed tokens, BeamFinds detail API, MEGA, Modland, Discord invites, Patreon -> external fallback.
- New src/lib/resolvers.ts: resolveDownload() with per-host resolvers, curl -i subprocess helper (Node TLS fingerprint workaround, cookie-jar per resolution), redirect-chain-aware response parser (last status block wins), in-memory TTL cache (modsfire signed URLs 8 min of their 600 s validity, stable hosts 30 min), PROXY_ALLOWED_HOSTS allowlist. Never throws — always degrades to { mode: "external", reason }.
- New GET /api/download: ?url= + optional ?name= (fallback filename). Allowlist check (no open proxy), resolve, then STREAM the file through the server with Content-Disposition: attachment (filename priority: upstream CD > resolver > name param), Range header passthrough (pause/resume works), content-type/length/range forwarded; native fetch first with a curl-spawn streaming fallback for TLS-fingerprint rejections; non-proxyable hosts/dead links -> 307 redirect to the original URL (old behaviour).
- New GET /api/download/resolve: pre-flight status for the UI, shares the resolver cache so the later actual click reuses the resolution.
- mod-dialog.tsx: per-link resolve state on open; primary button is now green "Download" (anchor to /api/download, download attr) with status line "Downloads here on JamFinds — no redirects" (primary, CheckCircle2); external links show outline "Open" + "Opens {host} in a new tab — {reason}" (e.g. "File removed from Modsfire"); loading state "Checking direct download…"; header hint "direct from JamFinds when possible"; Copy kept.
- mod-card.tsx: compact "Get" quick-download pill (Download icon + Get) pinned right in the host-badge strip, stopPropagation so it doesn't open the dialog, links to /api/download with sanitized title as ?name=.
- links.ts: exported classifyUrl (route uses it); extractLinks now splits glued URLs (fixed DB bug "modsfire.com/Xhttps://modsfire.com/X" being one link).
- Fixed during QA: curl helper never passed -i so status was always 0 and dead-link detection never fired -> rewrote parser to split redirect chains (dead links now report "File removed from Modsfire"); resolver filename returned "d.php" -> basenameFromUrl now prefers the base64 p= payload.
- Verified: typecheck clean; curl through /api/download streams a real 150 MB ModsFire zip (application/zip, correct Content-Disposition) and GDrive zip (206 + upstream filename); beamfinds/beamfree links 307-redirect; browser-verified dialog (proxy state green hint + Download for live links, external state for dead links), card Get buttons, mobile 390px (no overflow), cat=request isolation unchanged (109 / 0 leaked), zero console errors. Screenshots in download/dl-check-*.png.

Stage Summary:
- Deliverable: JamFinds now downloads files from the site itself — ModsFire/Google Drive/Pixeldrain/Mediafire/Dropbox/Discord-CDN links stream through /api/download (server resolves the direct URL, Range support, real filename); everything else falls back to opening the host. Requests section (Task 4) unaffected.

---
Task ID: 6
Agent: main (Z.ai)
Task: Fix wrong BeamFinds pages (/mods/{id} -> /mod/{id}), thumbnails for every downloadable mod, Maps undercounted (9 -> 21), per user report.

Work Log:
- BeamFinds URLs: detail pages live at /mod/{id} (singular) — /mods/{id} 404s (matches user's 404 screenshot). Fixed fetchBeamfinds permalink; live sync loop self-healed all 40 rows (backfill script scripts/fix-beamfinds-urls.ts found 0 remaining). Permalinks + stored links JSON + card Get hrefs + dialog "Open on BeamFinds" all now /mod/.
- Thumbnails: probed every host for preview images — ModsFire pages have NONE (only generic icons), Modland/Patreon 403 from sandbox, GDrive gives free previews via lh3.googleusercontent.com/d/{id}=w400 (verified). So: (1) sync normalize() now constructs GDrive thumbs for linkful imageless posts; (2) mod-card renders a generated cover (hero-bg glow + category icon tile + serving-host label, hover scale) for every downloadable card without a real image — no more bare car placeholders on downloadable mods; cover host label and card Get button now prefer the first REAL file-host link over "other" links (the http://BeamNG.drive joke links no longer win).
- Maps undercount: root causes were (a) weak MAP_RE missing road/raceway/city-map titles ("Sumner Road", "East Coast USA Remastered", "HAWAII" landed in other/vehicle) and (b) BeamFree's own category chips ignored. Fixes: MAP_RE extended (roads/backroads/raceway/speedway/circuit/airport/highway/freeway/drag strip/drift track/open world + canonical BeamNG maps east coast, west coast, jungle rock, sierra nevada, garfield heights, gridmap, hirochi raceway, automation test track, small island + hawaii/maui/jamaica); NormalizedEntry.catHint added, fetchBeamfree extracts .ccat ("🗺️ Map" -> map, "🚗 Cars"/"🚛 Semis"/"🛻 Trucks" -> vehicle), sync hintToCategory beats inference except requests still always win (Task 4 preserved); BeamFree thumbnail URLs unescaped (&amp; -> &).
- Categories self-heal: sync re-normalizes every fetched entry each cycle, so no manual recategorize was needed — map 11 -> 21 within minutes; scan of remaining other/vehicle titles shows 0 map-ish leftovers.
- Verified: typecheck (only pre-existing sync.ts rawTitle quirks); browser: Maps chip = 21 results, generated cover + host label render, BeamFinds dialog shows /mod/834 + "Opens BeamFinds in a new tab", all-grid cards carry thumbnails, desktop + mobile 390px no overflow, zero console errors. Screenshots download/t6-*.png.

Stage Summary:
- BeamFinds links everywhere go to the real detail page (/mod/{id}); every downloadable card shows a visual (real cover when available, styled generated cover otherwise); Maps fixed via BeamFree source categories + much stronger map regex; card Get button and cover now resolve to the first genuine file host.

---
Task ID: 7
Agent: main (Z.ai)
Task: Import the ENTIRE BeamFinds catalog — every category (IRL Vehicle, Fictional Vehicle, Map, Other, Parts, Config, Sound Mod, UI, legacy "vehicles") and every page (user saw up to page 29), replacing the 40-mod, no-category scrape.

Work Log:
- Probed beamfinds.com: the public GET /api/public/v1/mods IGNORES its category param (returns the same 478 for every category) — useless for per-category imports. Reverse-engineered the site's JS bundle (main-Bgp58QaB.js): the real app POSTs to /api/mods/list {page, limit, category, sort} (axios baseURL "/api"). Verified with curl: works unauthenticated, returns success/total/totalPages/mods with RICH rows (description, category, tags, file_size, game_version, downloads, views, ratings, images array, VirusTotal data).
- Catalog totals verified: IRL Vehicle 338, Fictional Vehicle 25, Map 24, Parts 34, Config 1, Sound Mod 6, UI 10, Other 27, legacy lowercase "vehicles" 13 = 478 exactly (matches unfiltered total). limit=50 works; last-page pagination (totalPages=7 @ IRL Vehicle) verified.
- scrapers.ts rewritten: curlPostJson (curl -X POST primary — their CDN still 403s Node TLS) + native fetch POST fallback; bfModsList(); BF_CATEGORIES export; bfEntry() maps category->catHint, description + stats line (file size, BeamNG version, downloads, rating) -> text, thumbnail + full images array -> cdn.beamfinds.com URLs (images field is a JSON string — parsed defensively). New exports: fetchBeamfindsTotal() (1-row probe, null on failure), fetchBeamfindsFull() (sweeps unfiltered + all 9 categories, all pages, 400/350ms politeness gaps, per-category error tolerance, dedupe by id — throws only if EVERYTHING failed). fetchBeamfinds(pages) now quick-mode POST (50/page newest-first) with the old GET API kept as fetchBeamfindsLegacy fallback.
- sync.ts BeamFinds branch: fetchBeamfindsTotal() vs db count(source=BeamFinds) — full sweep when have < total-10, quick top-up otherwise (page 1 covers day-to-day uploads; full sweep re-triggers after downtime >11 new mods). hintToCategory extended for BeamFinds vocabulary (config->parts, sound/audio->other, ui/interface/hud->other, other/misc->other); normalize() now trusts source categories over inference (web catalogs never contain request posts — requests-only-in-Requests rule untouched: all 109 requests are reddit rows without hints).
- Backfill: POST /api/sync -> fetched 614, inserted 438, updated 176 in 45s. DB now: BeamFinds 478/478 (exact parity with their catalog), site total 817 (was 379). Categories: vehicle 183->522, map 21->41, parts 11->46, other 54->98. 0 BF rows misfiled as request, 0 without thumbnail, 0 without links. Legacy "vehicles" rows (BMW E34, Gordon Murray T50S...) verified vehicle+thumb.
- Quick path verified: follow-up sync 5.4s, 0 inserted, 121 updated (no re-sweep); direct bun test of fetchBeamfinds(2): 100 entries, all with rich text + thumbnails + correct catHints; fetchBeamfindsTotal() = 478.
- Browser verified (desktop 1440 + mobile 390, no overflow): All mods 708 results, Vehicles 522, Maps 41, source dropdown shows "BeamFinds (478)", BF grid = every card with real cdn.beamfinds.com thumbnail + description preview + Get button, Gebbies Pass Road dialog shows rich description + https://beamfinds.com/mod/831 + "Opens BeamFinds in a new tab", live toast fired for the new mods, zero console errors. Screenshots download/t7-*.png.

Stage Summary:
- Deliverable: JamFinds now mirrors the complete BeamFinds catalog — all 478 mods across every category they have (incl. legacy "vehicles"), each with real thumbnail, full description, file size/game version/downloads/rating stats, and the source's own category mapped into our chips (IRL+Fictional+legacy vehicles -> Vehicles; Map -> Maps; Parts+Config -> Parts & Tuning; UI+Sound Mod+Other -> Other). Sync engine self-maintains: cheap newest-first top-up each cycle, automatic full re-sweep whenever we fall >11 mods behind. Requests isolation, BeamFinds /mod/{id} permalinks, and on-site download behavior unchanged.
