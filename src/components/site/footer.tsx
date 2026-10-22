"use client";

import { Heart, ExternalLink } from "lucide-react";
import { SOURCE_DEFS } from "@/lib/sources";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-card/40 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground/80">
              Jam<span className="text-gradient-jam">Finds</span> — unofficial live index of BeamNG.drive mods
            </p>
            <p className="mt-1.5">
              Not affiliated with Reddit, BeamNG GmbH, BeamFinds, BeamFree, or any subreddit staff. All mods are
              created and shared by their respective communities; JamFinds only indexes public posts and decodes the
              links they already contain. Use modded files at your own risk and scan downloads before installing.
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {SOURCE_DEFS.map((s) => (
                <a
                  key={s.key}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
                  {s.label}
                  <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                </a>
              ))}
            </p>
          </div>
          <div className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            made with <Heart className="h-3 w-3 text-primary" aria-hidden="true" /> for the BeamNG community
          </div>
        </div>
      </div>
    </footer>
  );
}
