"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { KeyRound, MessageSquare, User2, Car, Map as MapIcon, Wrench, HelpCircle, Info, Package } from "lucide-react";
import { hostStyle, parseLinks, parseImages, type ModItem } from "@/lib/types";
import { RelativeTime } from "./relative-time";

const CATEGORY_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  vehicle: { label: "Vehicle", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", icon: <Car className="h-3 w-3" /> },
  map: { label: "Map", cls: "border-lime-500/40 bg-lime-500/10 text-lime-300", icon: <MapIcon className="h-3 w-3" /> },
  skin: { label: "Skin", cls: "border-pink-500/40 bg-pink-500/10 text-pink-300", icon: <Package className="h-3 w-3" /> },
  parts: { label: "Parts", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300", icon: <Wrench className="h-3 w-3" /> },
  request: { label: "Request", cls: "border-rose-500/40 bg-rose-500/10 text-rose-300", icon: <HelpCircle className="h-3 w-3" /> },
  info: { label: "Info", cls: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300", icon: <Info className="h-3 w-3" /> },
  other: { label: "Other", cls: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300", icon: <Info className="h-3 w-3" /> },
};

export function categoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? CATEGORY_META.other;
}

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
  const isNew =
    serverNow && new Date(mod.firstSeenAt).getTime() > Date.now() - 24 * 3600_000
      ? new Date(mod.publishedAt).getTime() > Date.now() - 48 * 3600_000
      : false;

  return (
    <Card
      className={`group relative cursor-pointer overflow-hidden border-border bg-card/80 transition-all hover:border-emerald-500/40 hover:shadow-[0_0_24px_rgba(0,155,58,0.12)] ${
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
      <div className="relative h-40 w-full overflow-hidden bg-secondary/60">
        {thumb && !imgFailed ? (
          <img
            src={thumb}
            alt={mod.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center hero-bg">
            <Car className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          {isNew && (
            <Badge className="border-0 bg-gold text-black font-bold text-[10px] px-1.5 py-0">NEW</Badge>
          )}
        </div>
        <div className="absolute right-2 top-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cat.cls}`}>
            {cat.icon}
            {cat.label}
          </span>
        </div>
        {/* links strip */}
        {links.length > 0 && (
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-4">
            {links.slice(0, 3).map((l) => {
              const st = hostStyle(l.host);
              return (
                <span
                  key={l.url}
                  className={`inline-flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[10px] font-medium ${st.className}`}
                >
                  {l.decoded && <KeyRound className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
                  {l.label}
                </span>
              );
            })}
            {links.length > 3 && (
              <span className="text-[10px] text-zinc-300">+{links.length - 3}</span>
            )}
          </div>
        )}
      </div>

      <CardContent className="p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-foreground group-hover:text-emerald-300">
          {mod.title}
        </h3>
        {mod.text && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{mod.text}</p>}
        <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1">
            <User2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">u/{mod.author}</span>
          </span>
          <span className="shrink-0">·</span>
          <RelativeTime iso={mod.publishedAt} className="shrink-0" />
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded bg-secondary/70 px-1.5 py-0.5 text-[10px]">
            <MessageSquare className="h-3 w-3" aria-hidden="true" />r/{mod.source}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
