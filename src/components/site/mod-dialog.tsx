"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { KeyRound, Copy, ExternalLink, User2, ImageIcon, Check, Globe, Download, CheckCircle2, Loader2, Star } from "lucide-react";
import { hostStyle, parseLinks, parseImages, CATEGORY_STYLES, type ModItem } from "@/lib/types";
import { sourceDef } from "@/lib/sources";
import { useFavorites } from "@/hooks/use-favorites";
import { categoryMeta } from "./mod-card";
import { RelativeTime } from "./relative-time";

type ResolveState = { mode: "loading" | "proxy" | "external"; reason?: string };

export function ModDialog({ mod, open, onOpenChange }: { mod: ModItem | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [resolves, setResolves] = useState<Record<string, ResolveState>>({});
  const { toggle: toggleSaved, isSaved } = useFavorites();
  const links = useMemo(() => (mod ? parseLinks(mod) : []), [mod]);
  const images = useMemo(() => (mod ? parseImages(mod) : []), [mod]);
  const cat = mod ? categoryMeta(mod.category) : null;
  const catCls = mod ? CATEGORY_STYLES[mod.category] ?? CATEGORY_STYLES.other : "";
  const src = mod ? sourceDef(mod.source) : undefined;
  const isReddit = Boolean(mod && mod.id.startsWith("t3_"));
  const decodedCount = links.filter((l) => l.decoded).length;
  const fallbackName = useMemo(
    () => (mod ? mod.title.replace(/[/\\?%*:|<>"\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "mod" : "mod"),
    [mod],
  );

  // Ask the server which links can be downloaded through JamFinds itself.
  // Missing entries render as "checking" — no synchronous state reset needed.
  useEffect(() => {
    if (!open || links.length === 0) return;
    const ctrl = new AbortController();
    links.slice(0, 4).forEach(async (l) => {
      try {
        const r = await fetch(`/api/download/resolve?url=${encodeURIComponent(l.url)}`, { signal: ctrl.signal });
        const j = (await r.json()) as { mode: string; reason?: string };
        setResolves((prev) => ({ ...prev, [l.url]: { mode: j.mode === "proxy" ? "proxy" : "external", reason: j.reason } }));
      } catch {
        if (!ctrl.signal.aborted) setResolves((prev) => ({ ...prev, [l.url]: { mode: "external" } }));
      }
    });
    return () => ctrl.abort();
  }, [open, links]);

  if (!mod) return null;

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
      toast({ title: "Copied to clipboard", description: text.length > 80 ? text.slice(0, 80) + "…" : text });
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access — select the link text manually.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="nice-scroll max-h-[85vh] max-w-2xl overflow-y-auto rounded-xl! border-border bg-popover/90 backdrop-blur-xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-6">
            {cat && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${catCls}`}>
                {cat.icon}
                {cat.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${src?.dot ?? "bg-zinc-400"}`} aria-hidden="true" />
              {src?.label ?? mod.source}
            </span>
            {decodedCount > 0 && (
              <Badge className="border-0 bg-gold/90 text-[11px] font-bold text-black">
                <KeyRound className="mr-1 h-3 w-3" aria-hidden="true" /> {decodedCount} decoded
              </Badge>
            )}
            <button
              type="button"
              onClick={() => toggleSaved(mod.id)}
              aria-pressed={isSaved(mod.id)}
              aria-label={isSaved(mod.id) ? "Remove from saved" : "Save this mod"}
              title={isSaved(mod.id) ? "Saved — tap to remove" : "Save this mod"}
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary/60 text-muted-foreground transition-colors duration-150 hover:border-gold/50 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star className={`h-4 w-4 ${isSaved(mod.id) ? "fill-gold text-gold" : ""}`} aria-hidden="true" />
            </button>
          </div>
          <DialogTitle className="pr-6 text-left text-lg leading-snug">{mod.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <User2 className="h-3 w-3" aria-hidden="true" /> {mod.author}
            </span>
            <span>·</span>
            <span>
              posted <RelativeTime iso={mod.publishedAt} />
            </span>
            <span>·</span>
            <span>
              indexed by JamFinds <RelativeTime iso={mod.firstSeenAt} />
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Images */}
        {images.length > 0 && (
          <div className="nice-scroll flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Post images">
            {images.map((src, i) => (
              <a key={src} href={src} target="_blank" rel="noreferrer" className="relative shrink-0" role="listitem">
                <img
                  src={src}
                  alt={`${mod.title} — image ${i + 1}`}
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
            Download links{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {decodedCount > 0 ? `(${decodedCount} auto-decoded from base64)` : `(${links.length})`}
            </span>
            <span className="ml-1.5 hidden items-center gap-1 text-[11px] font-normal text-primary sm:inline">
              <Download className="h-3 w-3" aria-hidden="true" /> direct from JamFinds when possible
            </span>
          </h4>
          {links.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm leading-relaxed text-muted-foreground">
              No download link found in this post — it may be a request or discussion. Check the original thread or
              ask the author.
            </p>
          ) : (
            links.map((l) => {
              const st = hostStyle(l.host);
              const rs = resolves[l.url];
              const proxied = rs?.mode !== "external"; // loading + unknown default to Download
              const dlHref = `/api/download?url=${encodeURIComponent(l.url)}&name=${encodeURIComponent(fallbackName)}`;
              return (
                <div key={l.url} className="rounded-lg border border-border bg-card/60 p-3 transition-colors duration-150 hover:border-foreground/20">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${st.className}`}>
                          {l.decoded && <KeyRound className="h-3 w-3" aria-hidden="true" />}
                          {l.label}
                        </span>
                        {l.decoded && <span className="text-[10px] font-medium text-gold">base64 decoded</span>}
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={l.url}>
                        {l.url}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="outline" className="h-9 gap-1 sm:h-8" onClick={() => copy(l.url, l.url)}>
                        {copied === l.url ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied === l.url ? "Copied" : "Copy"}
                      </Button>
                      {proxied ? (
                        <Button size="sm" className="h-9 gap-1 bg-primary text-primary-foreground hover:bg-primary/90 sm:h-8" asChild>
                          <a href={dlHref} download>
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-9 gap-1 sm:h-8" asChild>
                          <a href={l.url} target="_blank" rel="noreferrer nofollow">
                            <ExternalLink className="h-3.5 w-3.5" /> Open
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
                    {rs === undefined || rs.mode === "loading" ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Checking direct download…
                      </>
                    ) : rs.mode === "proxy" ? (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Downloads here on JamFinds — no redirects
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" aria-hidden="true" /> Opens {l.label} in a new tab{rs.reason ? ` — ${rs.reason}` : ""}
                      </span>
                    )}
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
              {isReddit ? "Open on Reddit" : `Open on ${src?.label ?? "source site"}`}
            </a>
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => copy(mod.permalink, "src")}>
            {copied === "src" ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            {copied === "src" ? "Copied" : "Copy link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
