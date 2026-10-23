"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, PackageOpen, Satellite, WifiOff, Star } from "lucide-react";
import type { ModItem, ModsResponse } from "@/lib/types";
import { Header } from "@/components/site/header";
import { Hero } from "@/components/site/hero";
import { Filters, DEFAULT_FILTERS, type FilterState } from "@/components/site/filters";
import { ModCard, ModCardSkeleton } from "@/components/site/mod-card";
import { ModDialog } from "@/components/site/mod-dialog";
import { Footer } from "@/components/site/footer";
import { useFavorites } from "@/hooks/use-favorites";

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
  const t = useTranslations("home");
  const tr = useTranslations("ribbon");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 350);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<ModItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { saved: savedIds } = useFavorites();

  const queryKey = useMemo(() => ["mods", { q, ...filters }] as const, [q, filters]);

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    dataUpdatedAt,
  } = useInfiniteQuery<ModsResponse>({
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
  // "Saved" is a client-side pseudo-category: filter the loaded set by the
  // device's starred mods. Other filters are applied server-side.
  const savedView = filters.cat === "saved";
  const shownMods = useMemo(
    () => (savedView ? mods.filter((m) => savedIds.has(m.id)) : mods),
    [savedView, mods, savedIds],
  );
  const serverNow = latest?.serverNow ?? new Date().toISOString();

  /* ---------- new-mod detection + toast ---------- */
  const knownIds = useRef<Set<string> | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

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
        title: t("newModsToast", { count: arrived.length }),
        description: arrived[0] ? t("newModsToastLatest", { title: arrived[0].title.slice(0, 90) }) : undefined,
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
      return (await res.json()) as {
        ok: boolean;
        result?: { inserted: number; fetched: number; error?: string };
      };
    },
    onSuccess: async (res) => {
      await refetch();
      if (res.result?.error) {
        toast({
          title: t("rateLimitedToast"),
          description: t("rateLimitedToastBody"),
          variant: "destructive",
        });
      } else if ((res.result?.inserted ?? 0) > 0) {
        toast({
          title: t("syncedToast", { count: res.result!.inserted }),
        });
      } else {
        toast({ title: t("upToDateToast"), description: t("upToDateToastBody") });
      }
    },
    onError: () => {
      toast({
        title: t("syncFailedToast"),
        description: t("syncFailedToastBody"),
        variant: "destructive",
      });
    },
  });

  const openMod = useCallback((m: ModItem) => {
    setSelected(m);
    setDialogOpen(true);
  }, []);

  const totalCount = latest?.stats.total ?? 0;
  const resultCount = latest?.total ?? 0;
  const initialSyncing = !isLoading && latest !== undefined && totalCount === 0;
  // re-mount grid on filter change to replay the entrance animation
  const filterKey = `${q}|${filters.cat}|${filters.sort}|${filters.source}|${filters.withLinks}`;

  const gridClasses =
    "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <div className="flex min-h-screen flex-col">
      <Header sync={latest?.sync} refreshing={syncMutation.isPending} onRefresh={() => syncMutation.mutate()} />

      <main className="flex-1">
        <Hero data={latest} isLoading={!latest} />

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {/* How it works ribbon */}
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card/50 px-3.5 py-2.5 text-xs text-muted-foreground sm:mb-5">
            <span className="inline-flex items-center gap-1.5">
              <Satellite className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {tr("autoSync", { count: 6 })}
            </span>
            <span className="hidden text-foreground/15 sm:inline">|</span>
            <span>{tr("polls", { seconds: POLL_MS / 1000 })}</span>
            <span className="hidden text-foreground/15 sm:inline">|</span>
            <span>{tr("decoded")}</span>
            {dataUpdatedAt > 0 && (
              <>
                <span className="hidden text-foreground/15 md:inline">|</span>
                <span className="hidden md:inline">{tr("lastChecked", { time: new Date(dataUpdatedAt).toLocaleTimeString() })}</span>
              </>
            )}
          </div>

          <div className="mb-4 sm:mb-6">
            <Filters
              query={search}
              onQueryChange={setSearch}
              filters={filters}
              onChange={setFilters}
              data={latest}
              resultCount={savedView ? shownMods.length : resultCount}
              savedCount={savedIds.size}
            />
          </div>

          {/* States */}
          {isLoading ? (
            <div className={gridClasses} aria-busy="true" aria-label={t("loadingAria")}>
              {Array.from({ length: 8 }).map((_, i) => (
                <ModCardSkeleton key={i} />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-10 text-center sm:p-12">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15">
                <WifiOff className="h-6 w-6 text-destructive" aria-hidden="true" />
              </span>
              <div>
                <p className="tt-h2 text-foreground">{t("errorTitle")}</p>
                <p className="mt-1 text-sm text-destructive">{t("errorBody", { message: (error as Error)?.message ?? "unknown error" })}</p>
              </div>
              <Button variant="outline" className="mt-1 h-10" onClick={() => refetch()}>
                {t("tryAgain")}
              </Button>
            </div>
          ) : initialSyncing ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-primary/25 bg-primary/5 p-10 text-center sm:p-12">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                <Satellite className="h-6 w-6 animate-pulse text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="tt-h2 text-primary">{t("connectingTitle")}</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {t("connectingBody")}
                </p>
              </div>
            </div>
          ) : mods.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/50 p-10 text-center sm:p-12">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                <PackageOpen className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </span>
              <div>
                <p className="tt-h2 text-foreground">{t("noMatchTitle")}</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {t("noMatchBody")}
                </p>
              </div>
              <Button
                variant="outline"
                className="mt-1 h-10"
                onClick={() => {
                  setSearch("");
                  setFilters(DEFAULT_FILTERS);
                }}
              >
                {t("resetFilters")}
              </Button>
            </div>
          ) : shownMods.length === 0 ? (
            /* Saved view with nothing starred (or nothing loaded yet) */
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/50 p-10 text-center sm:p-12">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                <Star className="h-6 w-6 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="tt-h2 text-foreground">{t("nothingSavedTitle")}</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {t("nothingSavedBody")}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div key={filterKey} className={gridClasses} aria-live="polite">
                {shownMods.map((m, i) => (
                  <ModCard
                    key={m.id}
                    mod={m}
                    serverNow={serverNow}
                    fresh={isFresh(m.id)}
                    onOpen={openMod}
                    style={{ animationDelay: `${Math.min(i, 11) * 25}ms` }}
                  />
                ))}
              </div>
              {hasNextPage && (
                <div className="mt-8 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="h-10 gap-2 transition-all"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("loadingMore")}
                      </>
                    ) : !savedView && resultCount - mods.length > 0 ? (
                      t("loadMoreRemaining", { count: resultCount - mods.length })
                    ) : (
                      t("loadMore")
                    )}
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
