"use client";

import { Heart, ExternalLink } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="text-xs text-muted-foreground">
            <p className="font-semibold text-foreground/80">
              Jam<span className="text-gradient-jam">Finds</span> — unofficial live index of r/Beamng_Jamaica
            </p>
            <p className="mt-1 max-w-xl">
              Not affiliated with Reddit, BeamNG GmbH, or the subreddit staff. All mods are created and shared by the
              community; JamFinds only indexes public posts and decodes the links they already contain. Use modded
              files at your own risk and scan downloads before installing.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <a
              href="https://www.reddit.com/r/Beamng_Jamaica/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-emerald-300"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" /> r/Beamng_Jamaica
            </a>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              made with <Heart className="h-3 w-3 text-emerald-400" aria-hidden="true" /> for the JA community
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
