"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { KeyRound, Copy, ExternalLink, User2, ImageIcon, Check, Globe, Download, Star } from "lucide-react";
import { hostStyle, parseLinks, parseImages, CATEGORY_STYLES, type ModItem } from "@/lib/types";
import { sourceDef } from "@/lib/sources";
import { useFavorites } from "@/hooks/use-favorites";
import { resolveLink } from "@/hooks/use-mod-download";
import { DialogDownloadAction, DialogDownloadStatus } from "./download-button";
import { categoryMeta } from "./mod-card";
import { RelativeTime } from "./relative-time";

/**
 * Shared mod detail layout (Task 15) — the exact structure ModDialog has
 * always rendered, now also used by the /mod/[id] page: same badges, same
 * gallery, same download buttons, same link rows.
 *
 * Split mirrors the dialog's DOM so spacing stays identical:
 *  - ModDetailsHeader: badge row + title + meta (Radix DialogTitle slots in
 *    the dialog; real <h1> on the page)
 *  - ModDetailsRest:   multi-source note, gallery, body text, download
 *                      links, source actions
 */

/** Source chip — stacked dots + "on N sources" when the mod is multi-source. */
export function ModSourceChip({ mod }: { mod: ModItem }) {
  const t = useTranslations("card");
  const multi = mod.sources && mod.sources.length > 1;
  if (multi) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground"
        title={t("availableOn", { sources: mod.sources!.map((s) => s.label).join(", ") })}
      >
        <span className="flex items-center -space-x-1" aria-hidden="true">
          {mod.sources!.map((s) => (
            <span key={s.key} className={`h-1.5 w-1.5 rounded-full ring-1 ring-background ${s.dot}`} />
          ))}
        </span>
        {t("onSources", { count: mod.sources!.length })}
      </span>
    );
  }
  const src = sourceDef(mod.source);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${src?.dot ?? "bg-zinc-400"}`} aria-hidden="true" />
      {src?.label ?? mod.source}
    </span>
  );
}

/** Author · posted · indexed meta line (dialog description / page meta). */
export function ModMeta({ mod }: { mod: ModItem }) {
  const t = useTranslations("details");
  return (
    <>
      <span className="inline-flex items-center gap-1">
        <User2 className="h-3 w-3" aria-hidden="true" /> {mod.author}
      </span>
      <span>·</span>
      <span>
        {t("posted")} <RelativeTime iso={mod.publishedAt} />
      </span>
      <span>·</span>
      <span>
        {t("indexed")} <RelativeTime iso={mod.firstSeenAt} />
      </span>
    </>
  );
}

export function ModDetailsHeader({
  mod,
  titleSlot,
  metaSlot,
}: {
  mod: ModItem;
  titleSlot?: React.ReactNode;
  metaSlot?: React.ReactNode;
}) {
  const t = useTranslations("card");
  const tb = useTranslations("badges");
  const td = useTranslations("details");
  const { toggle: toggleSaved, isSaved } = useFavorites();
  const links = useMemo(() => parseLinks(mod), [mod]);
  const cat = categoryMeta(mod.category);
  const catCls = CATEGORY_STYLES[mod.category] ?? CATEGORY_STYLES.other;
  const decodedCount = links.filter((l) => l.decoded).length;

  return (
    <>
      {/* badges row: category, source, decoded, save */}
      <div className="flex flex-wrap items-center gap-2 pr-6">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${catCls}`}>
          {cat.icon}
          {tb(cat.key as "vehicle")}
        </span>
        <ModSourceChip mod={mod} />
        {decodedCount > 0 && (
          <Badge className="border border-primary/30 bg-primary/15 text-[11px] font-bold text-primary">
            <KeyRound className="mr-1 h-3 w-3" aria-hidden="true" /> {td("decoded", { count: decodedCount })}
          </Badge>
        )}
        <button
          type="button"
          onClick={() => toggleSaved(mod.id)}
          aria-pressed={isSaved(mod.id)}
          aria-label={isSaved(mod.id) ? td("saveAria") : t("saveTitle")}
          title={isSaved(mod.id) ? t("savedTitle") : t("saveTitle")}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary/60 text-muted-foreground transition-colors duration-150 hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star className={`h-4 w-4 ${isSaved(mod.id) ? "fill-primary text-primary" : ""}`} aria-hidden="true" />
        </button>
      </div>

      {titleSlot ?? <h2 className="pr-6 text-left text-lg leading-snug">{mod.title}</h2>}
      {metaSlot ?? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <ModMeta mod={mod} />
        </div>
      )}
    </>
  );
}

export function ModDetailsRest({ mod }: { mod: ModItem }) {
  const td = useTranslations("details");
  const [copied, setCopied] = useState<string | null>(null);
  const links = useMemo(() => parseLinks(mod), [mod]);
  const images = useMemo(() => parseImages(mod), [mod]);
  const src = sourceDef(mod.source);
  const isReddit = Boolean(mod.id.startsWith("t3_"));
  const decodedCount = links.filter((l) => l.decoded).length;
  const fallbackName = useMemo(
    () => mod.title.replace(/[/\\?%*:|<>"\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "mod",
    [mod],
  );
  const multiSource = Boolean(mod.sources && mod.sources.length > 1);

  // Warm the shared resolution cache so link rows render honest states.
  // Results are stored by use-mod-download (deduped with any card clicks).
  useEffect(() => {
    if (links.length === 0) return;
    links.slice(0, 4).forEach((l) => void resolveLink(l.url));
  }, [links]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
      toast({ title: td("copyToast"), description: td("copyToastBody", { text: text.length > 80 ? text.slice(0, 80) + "…" : text }) });
    } catch {
      toast({ title: td("copyFailed"), description: td("copyFailedBody"), variant: "destructive" });
    }
  };

  return (
    <>
      {multiSource && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {td("alsoOn", {
            sources: mod.sources!.filter((s) => s.key !== src?.key).map((s) => s.label).join(", "),
          })}
        </p>
      )}

      {/* Images */}
      {images.length > 0 && (
        <div className="nice-scroll flex gap-2 overflow-x-auto pb-1" role="list" aria-label={td("gallery")}>
          {images.map((src, i) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" className="relative shrink-0" role="listitem">
              <img
                src={src}
                alt={td("galleryAlt", { title: mod.title, index: i + 1 })}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-44 w-auto max-w-[300px] rounded-lg border border-border object-cover"
              />
              <span className="absolute bottom-1 right-1 rounded bg-black/60 p-1" aria-hidden="true">
                <ImageIcon className="h-3 w-3 text-white" />
              </span>
            </a>
          ))}
        </div>
      )}

      {/* Body text */}
      {mod.text && (
        <div className="rounded-lg border border-border bg-card/60 p-3">
          <p className="nice-scroll max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
            {mod.text}
          </p>
        </div>
      )}

      {/* Links */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">
          {td("downloadLinks")}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {decodedCount > 0 ? td("autoDecoded", { count: decodedCount }) : td("linkCount", { count: links.length })}
          </span>
          <span className="ml-1.5 hidden items-center gap-1 text-[11px] font-normal text-primary sm:inline">
            <Download className="h-3 w-3" aria-hidden="true" /> {td("directHint")}
          </span>
        </h4>
        {links.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-sm leading-relaxed text-muted-foreground">
            {td("noLinks")}
          </p>
        ) : (
          links.map((l) => {
            const st = hostStyle(l.host);
            return (
              <div key={l.url} className="rounded-lg border border-border bg-card/60 p-3 transition-colors duration-150 hover:border-foreground/20">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${st.className}`}>
                        {l.decoded && <KeyRound className="h-3 w-3" aria-hidden="true" />}
                        {l.label}
                      </span>
                      {l.decoded && <span className="text-[10px] font-medium text-primary">{td("base64Decoded")}</span>}
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={l.url}>
                      {l.url}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="outline" className="h-9 gap-1 sm:h-8" onClick={() => copy(l.url, l.url)}>
                      {copied === l.url ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === l.url ? td("copied") : td("copy")}
                    </Button>
                    <DialogDownloadAction url={l.url} name={fallbackName} />
                  </div>
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                  <DialogDownloadStatus url={l.url} fileLabel={l.label} />
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Source actions */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button variant="outline" className="gap-1.5" asChild>
          <a href={mod.permalink} target="_blank" rel="noreferrer">
            {isReddit ? <ExternalLink className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            {isReddit ? td("openReddit") : td("openSource", { source: src?.label ?? td("openFallback") })}
          </a>
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => copy(mod.permalink, "src")}>
          {copied === "src" ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          {copied === "src" ? td("copied") : td("copyLink")}
        </Button>
      </div>
    </>
  );
}
