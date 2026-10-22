"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  KeyRound,
  User2,
  Car,
  Map as MapIcon,
  Wrench,
  HelpCircle,
  Info,
  Package,
  Megaphone,
  Download,
  Unlink,
} from "lucide-react";
import {
  hostStyle,
  parseLinks,
  parseImages,
  CATEGORY_STYLES,
  hasDownloadLink,
  isDownloadLink,
  type ModItem,
} from "@/lib/types";
import { sourceDef } from "@/lib/sources";
import { RelativeTime } from "./relative-time";

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode }> = {
  vehicle: { label: "Vehicle", icon: <Car className="h-3 w-3" /> },
  map: { label: "Map", icon: <MapIcon className="h-3 w-3" /> },
  skin: { label: "Skin", icon: <Package className="h-3 w-3" /> },
  parts: { label: "Parts", icon: <Wrench className="h-3 w-3" /> },
  request: { label: "Request", icon: <HelpCircle className="h-3 w-3" /> },
  info: { label: "Info", icon: <Megaphone className="h-3 w-3" /> },
  other: { label: "Other", icon: <Info className="h-3 w-3" /> },
  "no-link": { label: "No download", icon: <Unlink className="h-3 w-3" /> },
};

export function categoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? CATEGORY_META.other;
}

/* Lucide components for the generated covers on cards without images. */
const BIG_ICONS: Record<string, typeof Car> = {
  vehicle: Car,
  map: MapIcon,
  skin: Package,
  parts: Wrench,
  request: HelpCircle,
  info: Megaphone,
  other: Info,
  "no-link": Unlink,
};

export function ModCard({
  mod,
  serverNow,
  fresh,
  onOpen,
}: {
  mod: ModItem;
  serverNow: string;
  fresh: boolean;
  onOpen: (mod: ModItem) => void;
}) {
  const links = useMemo(() => parseLinks(mod), [mod]);
  const images = useMemo(() => parseImages(mod), [mod]);
  const [imgFailed, setImgFailed] = useState(false);

  const thumb = mod.thumbnail ?? images[0] ?? null;
  const cat = categoryMeta(mod.category);
  const catCls = CATEGORY_STYLES[mod.category] ?? CATEGORY_STYLES.other;
  const src = sourceDef(mod.source);
  const isNew =
    serverNow && new Date(mod.firstSeenAt).getTime() > Date.now() - 24 * 3600_000
      ? new Date(mod.publishedAt).getTime() > Date.now() - 48 * 3600_000
      : false;

  return (
    <article
      className={`card-in surface-card surface-card-hover group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl bg-card/80 outline-none transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0 active:scale-[0.995] ${
        fresh ? "fresh-card" : ""
      }`}
      onClick={() => onOpen(mod)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(mod);
        }
      }}
      aria-label={`Open mod: ${mod.title}`}
    >
      {/* thumbnail */}
      <div className="relative h-40 w-full shrink-0 overflow-hidden bg-secondary/60">
        {thumb && !imgFailed ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          />
        ) : links.length > 0 ? (
          /* Generated cover — every downloadable mod gets a proper visual:
             ambient glow + category icon + the host that serves the file. */
          <div className="hero-bg flex h-full w-full flex-col items-center justify-center gap-1.5 transition-transform duration-300 ease-out group-hover:scale-[1.03]">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-secondary/50">
              {(() => {
                const Big = BIG_ICONS[mod.category] ?? Info;
                return <Big className="h-7 w-7 text-primary/50" aria-hidden="true" />;
              })()}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {hostStyle((links.find((l) => l.host !== "other") ?? links[0]).host).label}
            </span>
          </div>
        ) : (
          <div className="hero-bg flex h-full w-full items-center justify-center">
            <Car className="h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
          </div>
        )}

        {/* top row: category left, NEW right */}
        <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-[1.6] backdrop-blur-sm ${catCls}`}
          >
            {cat.icon}
            {cat.label}
          </span>
          {isNew && (
            <span className="rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-bold leading-[1.6] text-black shadow-sm">
              NEW
            </span>
          )}
        </div>

        {/* host badges strip + quick download (real download links only) */}
        {links.length > 0 && (
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2 pb-1.5 pt-5">
            {links.slice(0, 3).map((l) => {
              const st = hostStyle(l.host);
              return (
                <span
                  key={l.url}
                  className={`inline-flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[10px] font-medium leading-[1.6] backdrop-blur-sm ${st.className}`}
                >
                  {l.decoded && <KeyRound className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
                  {l.label}
                </span>
              );
            })}
            {links.length > 3 && (
              <span className="text-[10px] font-medium text-zinc-200">+{links.length - 3}</span>
            )}
            {hasDownloadLink(links) && (
              <a
                href={`/api/download?url=${encodeURIComponent((links.find((l) => isDownloadLink(l)) ?? links[0]).url)}&name=${encodeURIComponent(
                  mod.title.replace(/[/\\?%*:|<>"\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
                )}`}
                download
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/20 px-1.5 text-[10px] font-semibold text-zinc-50 backdrop-blur-sm transition-colors duration-150 hover:bg-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Download ${mod.title}`}
                title="Download via JamFinds"
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                Get
              </a>
            )}
          </div>
        )}
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <h3 className="tt-card-title line-clamp-2 min-h-[2.45rem] text-foreground transition-colors duration-150 group-hover:text-primary">
          {mod.title}
        </h3>
        {mod.text && <p className="line-clamp-2 text-xs leading-[1.5] text-muted-foreground">{mod.text}</p>}

        {/* meta row pinned to the bottom for even cards */}
        <div className="mt-auto flex items-center gap-1.5 pt-1.5 text-xs text-muted-foreground">
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium leading-[1.6]`}
            title={`Source: ${src?.label ?? mod.source}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${src?.dot ?? "bg-zinc-400"}`} aria-hidden="true" />
            {src?.label ?? mod.source}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <User2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{mod.author}</span>
          </span>
          <span className="ml-auto shrink-0">
            <RelativeTime iso={mod.publishedAt} />
          </span>
        </div>
      </div>
    </article>
  );
}

/** Skeleton that mirrors the ModCard layout for a calm loading state. */
export function ModCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card/60" aria-hidden="true">
      <Skeleton className="h-40 w-full shrink-0 rounded-none bg-secondary/70" />
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <Skeleton className="h-3.5 w-11/12 bg-secondary/70" />
        <Skeleton className="h-3.5 w-2/3 bg-secondary/70" />
        <div className="mt-auto flex items-center gap-2 pt-1.5">
          <Skeleton className="h-4 w-20 rounded-full bg-secondary/70" />
          <Skeleton className="h-4 w-14 rounded-full bg-secondary/70" />
          <Skeleton className="ml-auto h-4 w-10 rounded-full bg-secondary/70" />
        </div>
      </div>
    </div>
  );
}
