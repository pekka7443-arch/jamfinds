"use client";

/**
 * Download actions for JamFinds — one honest experience everywhere.
 *
 *  - "Download" (primary, purple): offered ONLY when the resolver verified
 *    the file actually streams through JamFinds.
 *  - "Open source page" (outline): offered when the provider requires its own
 *    site, with the resolver's plain-language reason (never a fake direct
 *    download, never a silent external redirect under a "Download" label).
 *
 * Dialog variant: File System Access streaming with byte progress + cancel on
 * Chromium desktop, native handoff elsewhere. Card variant: fast native
 * handoff; if the link turns out to be external it opens the mod dialog
 * where the full explanation lives.
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import {
  startDownload,
  cancelDownload,
  resetDownload,
  resolveLink,
  useDownloadState,
  peekResolve,
} from "@/hooks/use-mod-download";
import { formatBytes, cn } from "@/lib/utils";
import {
  Download,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Lock,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Dialog variant                                                      */
/* ------------------------------------------------------------------ */

export function DialogDownloadAction({ url, name }: { url: string; name: string }) {
  const t = useTranslations("download");
  const state = useDownloadState(url);
  const resolve = state.resolve;

  // Make sure a resolution exists (warm cache from the dialog open effect
  // usually covers this — this is the fallback for a cold open).
  useEffect(() => {
    if (!resolve) void resolveLink(url);
  }, [url, resolve]);

  const busy = state.phase === "resolving" || state.phase === "streaming";
  const external = resolve?.mode === "external";

  /* --- Provider requires its own site ------------------------------- */
  if (external) {
    return (
      <div className="flex shrink-0 gap-1.5">
        <Button size="sm" variant="outline" className="h-9 gap-1.5 sm:h-8" asChild>
          <a href={url} target="_blank" rel="noreferrer nofollow">
            <ExternalLink className="h-3.5 w-3.5" /> {t("openSourcePage")}
          </a>
        </Button>
      </div>
    );
  }

  /* --- Verified direct download ------------------------------------- */
  const pct = state.total ? Math.min(100, Math.round((state.received / state.total) * 100)) : null;
  const speed =
    state.phase === "streaming" && state.startedAt && state.received > 0
      ? formatBytes(state.received / Math.max(0.5, (Date.now() - state.startedAt) / 1000)) + "/s"
      : null;

  if (state.phase === "streaming") {
    return (
      <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-56">
        <Progress value={pct ?? undefined} className="h-2" aria-label={t("progress")} />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {pct != null ? `${pct}%` : formatBytes(state.received) || t("starting")}
            {state.total ? ` · ${formatBytes(state.received)} / ${formatBytes(state.total)}` : ""}
            {speed ? ` · ${speed}` : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              cancelDownload(url);
              toast({ title: t("cancelledToast") });
            }}
            className="rounded px-1 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <Button
          size="sm"
          className="h-9 gap-1 bg-primary text-primary-foreground hover:bg-primary/90 sm:h-8"
          disabled={busy}
          onClick={() =>
            void startDownload(url, { name, preferPicker: true }).then(() => {
              // For an external surprise (resolution raced) nothing happened —
              // the re-render now shows the Open source page action.
            })
          }
        >
          {state.phase === "resolving" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("preparing")}
            </>
          ) : state.phase === "done" ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("saved")}
            </>
          ) : state.phase === "error" ? (
            <>
              <XCircle className="h-3.5 w-3.5" /> {t("retry")}
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" /> {t("download")}
            </>
          )}
        </Button>
      </div>
      {state.phase === "handed-off" && (
        <span className="text-[10px] text-muted-foreground">{t("handedOff")}</span>
      )}
      {state.phase === "cancelled" && (
        <span className="text-[10px] text-muted-foreground">{t("cancelledRetry")}</span>
      )}
      {state.phase === "error" && (
        <span className="max-w-56 text-right text-[10px] leading-tight text-destructive">
          {state.error}
          <br />
          {t("errorRetry")}
        </span>
      )}
      {state.phase === "done" && state.filename && (
        <span className="max-w-56 truncate text-right text-[10px] text-muted-foreground" title={state.filename}>
          {state.filename}
        </span>
      )}
    </div>
  );
}

/** Status line under each dialog link row — verified / fallback explanation. */
export function DialogDownloadStatus({ url, fileLabel }: { url: string; fileLabel: string }) {
  const t = useTranslations("download");
  const state = useDownloadState(url);
  const resolve = state.resolve;

  if (state.phase === "streaming" || state.phase === "resolving") {
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        {state.phase === "streaming" ? t("downloadingThrough") : t("preparingDirect")}
      </span>
    );
  }
  if (resolve?.mode === "proxy") {
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        {t("downloadsHere")}
        {resolve.fileHost ? ` · via ${resolve.fileHost}` : ""}
        {resolve.size ? ` · ${formatBytes(resolve.size)}` : ""}
        {resolve.filename ? ` · ${resolve.filename}` : ""}
      </span>
    );
  }
  if (resolve?.mode === "external") {
    return (
      <span className="inline-flex items-center gap-1">
        <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
        {resolve.reason ? t("requiresReason", { label: fileLabel, reason: resolve.reason }) : t("requires", { label: fileLabel })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> {t("checking")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Card variant                                                        */
/* ------------------------------------------------------------------ */

export function CardDownloadButton({
  url,
  name,
  title,
  onExternal,
}: {
  url: string;
  name: string;
  title: string;
  onExternal: () => void;
}) {
  const t = useTranslations("download");
  const state = useDownloadState(url);
  const busy = state.phase === "resolving" || state.phase === "streaming";
  // External links never show a fake Get pill — the card hides the action
  // entirely and the dialog explains (matches "working mods only" policy).

  useEffect(() => {
    if (state.phase === "done") {
      const t = setTimeout(() => resetDownload(url), 3_000);
      return () => clearTimeout(t);
    }
  }, [state.phase, url]);

  const handleClick = async () => {
    const info = peekResolve(url);
    if (info?.mode === "external") {
      onExternal();
      return;
    }
    await startDownload(url, { name, preferPicker: false });
    const after = peekResolve(url);
    if (after?.mode === "external") {
      // Resolution arrived while we were checking — route to the dialog.
      onExternal();
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void handleClick();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={busy}
      className={cn(
        "ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/20 px-1.5 text-[10px] font-semibold text-zinc-50 backdrop-blur-sm transition-colors duration-150 hover:bg-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        (state.phase === "handed-off" || state.phase === "done") && "border-primary/60 bg-primary/35",
      )}
      aria-label={t("downloadAria", { title })}
      title={
        state.phase === "done"
          ? t("savedAgain")
          : state.phase === "handed-off"
            ? t("handedOffTitle")
            : t("viaJamFinds")
      }
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : state.phase === "done" ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Download className="h-3 w-3" aria-hidden="true" />
      )}
      {state.phase === "done" ? t("saved") : state.phase === "handed-off" ? t("sent") : t("get")}
    </button>
  );
}
