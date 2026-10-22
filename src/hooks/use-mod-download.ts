"use client";

/**
 * Direct-download engine for JamFinds.
 *
 * One shared store per URL — the mod card, the dialog and any other surface
 * see the same resolution + progress state, so a resolve warmed in one place
 * is reused everywhere and a running stream can never be double-started.
 *
 * Flow for `startDownload`:
 *  1. Resolve the link via /api/download/resolve (cached, deduped). The
 *     resolver VERIFIES the file before answering "proxy" — the UI never
 *     promises a direct download it cannot serve.
 *  2a. File System Access API available (Chromium desktop): stream the
 *      /api/download response straight to the user-chosen file — byte-accurate
 *      progress, real completion confirmation, cancel support, and no point
 *      where the whole file sits in memory.
 *  2b. Otherwise: hand off natively via an anchor click — the browser's own
 *      download manager streams and shows progress. We report exactly what we
 *      know ("handed to your browser") and nothing we can't.
 *
 * "external" results are surfaced with the resolver's honest reason so the UI
 * can send the user to the original mod page instead of pretending.
 */

import { useSyncExternalStore } from "react";
import { toast } from "@/hooks/use-toast";

export interface ResolveInfo {
  mode: "proxy" | "external";
  filename?: string | null;
  size?: number | null;
  fileHost?: string | null;
  reason?: string;
}

export type DlPhase =
  | "idle"
  | "resolving"
  | "streaming"
  | "handed-off"
  | "done"
  | "cancelled"
  | "error";

export interface DlState {
  phase: DlPhase;
  resolve: ResolveInfo | null;
  /** Bytes written so far (streaming). */
  received: number;
  /** Total bytes when known. */
  total: number | null;
  /** Monotonic start time for speed display. */
  startedAt: number;
  error: string | null;
  /** Name we suggested to the save picker. */
  filename: string | null;
}

const IDLE: DlState = { phase: "idle", resolve: null, received: 0, total: null, startedAt: 0, error: null, filename: null };

/* ------------------------------------------------------------------ */
/* Shared store                                                        */
/* ------------------------------------------------------------------ */

const states = new Map<string, DlState>();
const listeners = new Map<string, Set<() => void>>();
/** In-flight resolve promises (dedupe across components). */
const inflightResolves = new Map<string, Promise<ResolveInfo>>();
/** URLs with a stream/native handoff currently running (duplicate guard). */
const activeDownloads = new Set<string>();
const abortCtrls = new Map<string, AbortController>();

function getState(url: string): DlState {
  return states.get(url) ?? IDLE;
}

function setState(url: string, patch: Partial<DlState>) {
  const prev = getState(url);
  const next = { ...prev, ...patch };
  states.set(url, next);
  listeners.get(url)?.forEach((fn) => fn());
}

function subscribe(url: string, cb: () => void): () => void {
  let set = listeners.get(url);
  if (!set) {
    set = new Set();
    listeners.set(url, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
  };
}

/** Hook: reactive per-URL download state (shared across all consumers). */
export function useDownloadState(url: string | null): DlState {
  return useSyncExternalStore(
    url ? (cb) => subscribe(url, cb) : () => () => {},
    url ? () => getState(url) : () => IDLE,
    () => IDLE,
  );
}

/* ------------------------------------------------------------------ */
/* Resolution (shared cache + sessionStorage persistence)              */
/* ------------------------------------------------------------------ */

const CACHE_KEY = "jamfinds.resolve.v1";
const CACHE_TTL = 10 * 60_000;

type CacheShape = Record<string, { at: number; info: ResolveInfo }>;

function loadCache(): CacheShape {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "{}") as CacheShape;
  } catch {
    return {};
  }
}

function persistCache(cache: CacheShape) {
  try {
    // Keep it small — drop stale + overflow entries.
    const now = Date.now();
    const fresh = Object.fromEntries(
      Object.entries(cache)
        .filter(([, v]) => now - v.at < CACHE_TTL)
        .slice(-120),
    );
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
  } catch {
    /* storage full/blocked — cache stays in memory only */
  }
}

function cachedResolve(url: string): ResolveInfo | null {
  const hit = loadCache()[url];
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.info;
  return null;
}

/** Synchronous, non-reactive read of the last known resolution (UI routing). */
export function peekResolve(url: string): ResolveInfo | null {
  const live = getState(url).resolve;
  if (live) return live;
  return cachedResolve(url);
}

/** True while a download for this URL is being resolved or streamed. */
export function isDownloadActive(url: string): boolean {
  return activeDownloads.has(url);
}

/**
 * Resolve a link (cached + deduped). `force` bypasses the client cache but
 * still coalesces concurrent identical fetches.
 */
export function resolveLink(url: string, force = false): Promise<ResolveInfo> {
  if (!force) {
    const hit = cachedResolve(url);
    if (hit) {
      // The store must know even on a cache hit — the per-URL UI reads its
      // state from here, never from the promise.
      if (getState(url).resolve?.mode !== hit.mode) setState(url, { resolve: hit });
      return Promise.resolve(hit);
    }
  }
  const running = inflightResolves.get(url);
  if (running) return running;

  const p = (async () => {
    try {
      const res = await fetch(`/api/download/resolve?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`resolve ${res.status}`);
      const info = (await res.json()) as ResolveInfo;
      const cache = loadCache();
      cache[url] = { at: Date.now(), info };
      persistCache(cache);
      setState(url, { resolve: info });
      return info;
    } catch {
      const info: ResolveInfo = { mode: "external", reason: "Could not check direct-download support" };
      setState(url, { resolve: info });
      return info;
    } finally {
      inflightResolves.delete(url);
    }
  })();
  inflightResolves.set(url, p);
  return p;
}

/* ------------------------------------------------------------------ */
/* Download start                                                      */
/* ------------------------------------------------------------------ */

function dlHref(url: string, name: string): string {
  return `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
}

interface FileSystemWritableFileStream {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}
interface FSPickerHandle {
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
}
interface FSPickerWindow {
  showSaveFilePicker(opts: {
    suggestedName?: string;
  }): Promise<FSPickerHandle>;
}

function hasFSA(): boolean {
  try {
    return typeof window !== "undefined" && "showSaveFilePicker" in window && window.isSecureContext === true;
  } catch {
    return false;
  }
}

/** Idle watchdog — abort if the stream stalls with no bytes for 60 s. */
const IDLE_TIMEOUT_MS = 60_000;

export interface StartDownloadOptions {
  /** Fallback filename when the resolver didn't provide one. */
  name: string;
  /** Use the File System Access save dialog when available (dialog surfaces). */
  preferPicker?: boolean;
}

/**
 * Start a download for `url`. Resolves quickly with the outcome the UI
 * should reflect; all state transitions also flow through the shared store.
 * Duplicate clicks while a download is active are ignored.
 */
export async function startDownload(url: string, opts: StartDownloadOptions): Promise<void> {
  if (activeDownloads.has(url)) return; // duplicate-click guard
  activeDownloads.add(url);

  try {
    setState(url, { phase: "resolving", error: null, received: 0, total: null, startedAt: 0 });
    const info = await resolveLink(url);

    if (info.mode !== "proxy") {
      // Not downloadable here — the UI renders "Open source page" with the
      // resolver's reason. Reset the busy state; nothing was started.
      setState(url, { phase: "idle" });
      return;
    }

    const fallbackName = `${opts.name || "mod"}.zip`;
    const filename = info.filename || fallbackName;
    const href = dlHref(url, opts.name);

    if (opts.preferPicker && hasFSA()) {
      await streamToFile(url, href, filename, info.size ?? null);
    } else {
      handoffNative(url, href);
    }
  } catch (err) {
    const e = err as Error & { name?: string };
    if (e.name === "AbortError") {
      setState(url, { phase: "cancelled" });
    } else if (e.name === "NotAllowedError") {
      // User dismissed the save dialog — not an error.
      setState(url, { phase: "idle" });
    } else {
      setState(url, { phase: "error", error: friendlyError(e) });
    }
  } finally {
    activeDownloads.delete(url);
  }
}

function friendlyError(e: Error): string {
  const msg = e.message || "Download failed";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Connection lost while downloading";
  if (/resolve \d+|Server responded 429/.test(msg)) return "Too many requests — wait a moment and retry";
  if (/Server responded (\d+)/.test(msg)) return `Server responded ${msg.match(/Server responded (\d+)/)?.[1]} — try again shortly`;
  return msg;
}

/** Chromium desktop: stream the proxy response to the user-chosen file. */
async function streamToFile(url: string, href: string, filename: string, knownSize: number | null) {
  const picker = (window as unknown as FSPickerWindow).showSaveFilePicker;
  const handle = await picker.call(window, { suggestedName: filename });

  const ctrl = new AbortController();
  abortCtrls.set(url, ctrl);
  ctrl.signal.addEventListener("abort", () => {
    // Cancel from elsewhere (unmount) — mark state once.
    if (getState(url).phase === "streaming") setState(url, { phase: "cancelled" });
  });

  setState(url, {
    phase: "streaming",
    received: 0,
    total: knownSize,
    startedAt: Date.now(),
    filename,
    error: null,
  });

  try {
    const res = await fetch(href, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ctype.includes("text/html")) throw new Error("The server returned an error page instead of the file");

    const total = Number(res.headers.get("content-length")) || knownSize;
    setState(url, { total });

    const writable = await handle.createWritable();
    const reader = res.body!.getReader();
    let received = 0;
    let lastPaint = 0;

    try {
      for (;;) {
        // Race each chunk against the idle watchdog so a stalled upstream
        // surfaces as a cancellable error instead of hanging forever.
        const chunk = await withIdleWatch(reader.read(), ctrl);
        if (chunk.done) break;
        received += chunk.value.byteLength;
        await writable.write(chunk.value);
        const now = Date.now();
        if (now - lastPaint > 200) {
          lastPaint = now;
          setState(url, { received, total });
        }
      }
      await writable.close();
      setState(url, { phase: "done", received, total });
      toast({ title: "Download complete", description: filename });
    } catch (err) {
      // Don't leave a partial file behind.
      try {
        await writable.abort?.("download cancelled or failed");
      } catch {
        /* already closed/aborted */
      }
      throw err;
    }
  } finally {
    abortCtrls.delete(url);
  }
}

async function withIdleWatch<T>(readPromise: Promise<T>, ctrl: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readPromise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctrl.abort();
          reject(new Error("Download stalled — no data for 60 s"));
        }, IDLE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Anchor handoff — the browser's native download manager takes over. */
function handoffNative(url: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Honest wording: we know the browser took the request; we cannot observe
  // its download manager, so we never claim "completed".
  setState(url, { phase: "handed-off", startedAt: Date.now() });
  setTimeout(() => {
    if (getState(url).phase === "handed-off") setState(url, { phase: "idle" });
  }, 4_000);
}

/** Cancel a running stream (no effect on native handoffs — the browser owns those). */
export function cancelDownload(url: string) {
  const ctrl = abortCtrls.get(url);
  if (ctrl) {
    ctrl.abort();
    setState(url, { phase: "cancelled" });
  }
}

/** Clear transient state (back to idle), keeping the cached resolution. */
export function resetDownload(url: string) {
  if (activeDownloads.has(url)) return;
  setState(url, { phase: "idle", error: null, received: 0, total: null });
}
