"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Loader2, PackageOpen, Satellite, SearchX } from "lucide-react";
import type { ModItem, ModsResponse } from "@/lib/types";
import { Header } from "@/components/site/header";
import { Hero } from "@/components/site/hero";
import { Filters, type FilterState } from "@/components/site/filters";
import { ModCard } from "@/components/site/mod-card";
import { ModDialog } from "@/components/site/mod-dialog";
import { Footer } from "@/components/site/footer";

const POLL_MS = 20_000;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function Home() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 350);
  const [filters, setFilters] = useState<FilterState>({ cat: "all", sort: "new", withLinks: false, source: "all" });
  const [selected, setSelected] = useState<ModItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const queryKey = useMemo(
    () => ["mods", { q, ...filters }] as const,
    [q, filters],
  );

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, dataUpdatedAt } =
    useInfiniteQuery<ModsResponse>({
      queryKey,
      queryFn: async ({ pageParam }) => {
        const p = pageParam as number;
        const params = new URLSearchParams({
          q,
          cat: filters.cat,
          sort: filters.sort,
          source: filters.source,
          withLinks: filters.withLinks ? "1" : "0",
          page: String(p),
          limit: "24",
        });
        const res = await fetch(`/api/mods?${params.toString()}`);
        if (!res.ok) throw new Error(`API ${res.status}`);
        return (await res.json()) as ModsResponse;
      },
      initialPageParam: 1,
      getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
      refetchInterval: POLL_MS,
      refetchOnWindowFocus: true,
    });

  const pages = data?.pages ?? [];
  const latest = pages[0];
  const mods = useMemo(() => pages.flatMap((p) => p.mods), [pages]);
  const serverNow = latest?.serverNow ?? new Date().toISOString();

  /* ---------- new-mod detection + toast ---------- */
  const knownIds = useRef<Set<string> | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set()); // ids that just arrived -> gold glow

  useEffect(() => {
    if (!latest) return;
    const ids = new Set(mods.map((m) => m.id));
    if (knownIds.current === null) {
      knownIds.current = ids;
      return;
    }
    const prev = knownIds.current;
    const arrived: ModItem[] = mods.filter((m) => !prev.has(m.id));
    knownIds.current = ids;
    if (arrived.length > 0) {
      const arrivedIds = new Set(arrived.map((m) => m.id));
      setFreshIds((old) => new Set([...old, ...arrivedIds]));
      toast({
        title: `🔥 ${arrived.length} new mod${arrived.length === 1 ? "" : "s"} just dropped`,
        description: arrived[0] ? `Latest: ${arrived[0].title.slice(0, 90)}` : undefined,
      });
    }
  }, [latest, mods]);

  // let the fresh glow expire 60s after the last arrival
  useEffect(() => {
    if (freshIds.size === 0) return;
    const t = setTimeout(() => setFreshIds(new Set()), 60_000);
    return () => clearTimeout(t);
  }, [freshIds]);

  const isFresh = useCallback((id: string) => freshIds.has(id), [freshIds]);

  /* ---------- manual force sync ---------- */
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) throw new Error(`sync failed: ${res.status}`);
      return (await res.json()) as { ok: boolean; result?: { inserted: number; fetched: number; error?: string } };
    },
    onSuccess: async (res) => {
      await refetch();
      if (res.result?.error) {
        toast({ title: "Reddit is rate-limiting us", description: "Retrying automatically with backoff — sit tight.", variant: "destructive" });
      } else if ((res.result?.inserted ?? 0) > 0) {
        toast({ title: `✅ Synced — ${res.result.inserted} new mod${res.result.inserted === 1 ? "" : "s"} found` });
      } else {
        toast({ title: "✅ Already up to date", description: "No new posts on Reddit since last sync." });
      }
    },
    onError: () => {
      toast({ title: "Sync failed", description: "Could not reach the sync service. Try again in a minute.", variant: "destructive" });
    },
  });

  const openMod = useCallback((m: ModItem) => {
    setSelected(m);
    setDialogOpen(true);
  }, []);

  const totalCount = latest?.stats.total ?? 0;
  const resultCount = latest?.total ?? 0;
  const initialSyncing = !isLoading && latest !== undefined && totalCount === 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        query={search}
        onQueryChange={setSearch}
        sync={latest?.sync}
        refreshing={syncMutation.isPending}
        onRefresh={() => syncMutation.mutate()}
      />

      <main className="flex-1">
        <Hero data={latest} isLoading={!latest} />

        <div className="mx-auto max-w-7xl px-4 py-6">
          {/* How it works ribbon */}
          <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card/50 px-4 py-2.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Satellite className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> Auto-syncs from Reddit every minute
            </span>
            <span className="hidden sm:inline text-border">|</span>
            <span>
              Client polls every {POLL_MS / 1000}s — new finds pop a toast
            </span>
            <span className="hidden sm:inline text-border">|</span>
            <span>Base64 mod codes are decoded automatically</span>
            {dataUpdatedAt > 0 && (
              <>
                <span className="hidden md:inline text-border">|</span>
                <span className="hidden md:inline">last checked {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
              </>
            )}
          </div>

          <div className="mb-5">
            <Filters filters={filters} onChange={setFilters} data={latest} resultCount={resultCount} />
          </div>

          {/* States */}
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-40 w-full rounded-xl" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-10 text-center">
              <SearchX className="h-8 w-8 text-red-400" aria-hidden="true" />
              <p className="text-sm text-red-300">Couldn&apos;t load mods: {(error as Error)?.message ?? "unknown error"}</p>
              <Button variant="outline" onClick={() => refetch()}>Try again</Button>
            </div>
          ) : initialSyncing ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" aria-hidden="true" />
              <div>
                <p className="font-semibold text-emerald-300">Connecting to Reddit…</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  JamFinds is pulling the latest posts from r/Beamng_Jamaica right now. The first sync takes a few seconds —
                  this page will fill up automatically.
                </p>
              </div>
            </div>
          ) : mods.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/50 p-12 text-center">
              <PackageOpen className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">No mods match your filters</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Try clearing the search, switching category, or turning off &quot;Ready to download&quot;. New posts sync
                automatically every minute.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setFilters({ cat: "all", sort: "new", withLinks: false, source: "all" });
                }}
              >
                Reset filters
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {mods.map((m) => (
                  <ModCard key={m.id} mod={m} serverNow={serverNow} fresh={isFresh(m.id)} onOpen={openMod} />
                ))}
              </div>
              {hasNextPage && (
                <div className="mt-8 flex justify-center">
                  <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="gap-2">
                    {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Load more mods
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />

      <ModDialog mod={selected} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
