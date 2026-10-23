"use client";

import { useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ModItem } from "@/lib/types";
import { parseLinks } from "@/lib/types";
import { resolveLink } from "@/hooks/use-mod-download";
import { ModDetailsHeader, ModDetailsRest, ModMeta } from "./mod-details";

export function ModDialog({ mod, open, onOpenChange }: { mod: ModItem | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const links = useMemo(() => (mod ? parseLinks(mod) : []), [mod]);

  // Warm the shared resolution cache when the dialog opens. Results are
  // stored by use-mod-download (deduped with any card clicks) — the
  // per-link rows read the same store and render honest states.
  useEffect(() => {
    if (!open || links.length === 0) return;
    links.slice(0, 4).forEach((l) => void resolveLink(l.url));
  }, [open, links]);

  if (!mod) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="nice-scroll max-h-[85vh] max-w-2xl overflow-y-auto rounded-xl! border-border bg-popover shadow-2xl">
        <DialogHeader>
          <ModDetailsHeader
            mod={mod}
            titleSlot={<DialogTitle className="pr-6 text-left text-lg leading-snug">{mod.title}</DialogTitle>}
            metaSlot={
              <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <ModMeta mod={mod} />
              </DialogDescription>
            }
          />
        </DialogHeader>
        <ModDetailsRest mod={mod} />
      </DialogContent>
    </Dialog>
  );
}
