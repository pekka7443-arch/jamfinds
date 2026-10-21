"use client";

import { useMemo, useState } from "react";
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
import {
  KeyRound,
  Copy,
  ExternalLink,
  User2,
  ImageIcon,
  Check,
} from "lucide-react";
import { hostStyle, parseLinks, parseImages, type ModItem } from "@/lib/types";
import { categoryMeta } from "./mod-card";
import { RelativeTime } from "./relative-time";

export function ModDialog({ mod, open, onOpenChange }: { mod: ModItem | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const links = useMemo(() => (mod ? parseLinks(mod) : []), [mod]);
  const images = useMemo(() => (mod ? parseImages(mod) : []), [mod]);
  const cat = mod ? categoryMeta(mod.category) : null;

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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto nice-scroll border-border bg-popover">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-6">
            {cat && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cat.cls}`}>
                {cat.icon}
                {cat.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              r/{mod.source}
            </span>
            {links.some((l) => l.decoded) && (
              <Badge className="border-0 bg-gold/90 text-black text-[11px] font-bold">
                <KeyRound className="mr-1 h-3 w-3" aria-hidden="true" /> Link decoded
              </Badge>
            )}
          </div>
          <DialogTitle className="text-left text-lg leading-snug pr-6">{mod.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <User2 className="h-3 w-3" aria-hidden="true" /> u/{mod.author}
            </span>
            <span>·</span>
            <span>
              posted <RelativeTime iso={mod.publishedAt} />
            </span>
            <span>·</span>
            <span>
              found by JamFinds <RelativeTime iso={mod.firstSeenAt} />
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Images */}
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto nice-scroll pb-1" role="list" aria-label="Post images">
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
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90 nice-scroll max-h-64 overflow-y-auto">
              {mod.text}
            </p>
          </div>
        )}

        {/* Decoded links */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">
            Download links{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({links.filter((l) => l.decoded).length} auto-decoded from base64)
            </span>
          </h4>
          {links.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              No download link found in this post — it may be a request or discussion. Check the Reddit thread or ask the author.
            </p>
          ) : (
            links.map((l) => {
              const st = hostStyle(l.host);
              return (
                <div key={l.url} className="flex flex-col gap-2 rounded-lg border border-border bg-card/60 p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${st.className}`}>
                        {l.decoded && <KeyRound className="h-3 w-3" aria-hidden="true" />}
                        {l.label}
                      </span>
                      {l.decoded && <span className="text-[10px] text-gold">base64 decoded</span>}
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={l.url}>
                      {l.url}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => copy(l.url, l.url)}>
                      {copied === l.url ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === l.url ? "Copied" : "Copy"}
                    </Button>
                    <Button size="sm" className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-500" asChild>
                      <a href={l.url} target="_blank" rel="noreferrer nofollow">
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Reddit actions */}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button className="gap-1.5 bg-orange-600 hover:bg-orange-500" asChild>
            <a href={mod.permalink} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Open on Reddit
            </a>
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => copy(mod.permalink, "reddit")}>
            {copied === "reddit" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied === "reddit" ? "Copied" : "Copy Reddit link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
