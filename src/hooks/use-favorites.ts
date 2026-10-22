"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Saved mods (favorites) — persisted per device in localStorage.
 *
 * A tiny external store: all hook instances share one module-level set and
 * a custom window event, so toggling a star on a card instantly updates the
 * dialog and the Saved chip without a provider. Hydration-safe: the server
 * snapshot is empty; localStorage is read in an effect right after mount.
 */

const KEY = "jamfinds:saved";
const EVT = "jamfinds:saved-change";
const EMPTY: Set<string> = new Set();

function read(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

/** Module-level shared state — one Set per page, kept across hook users. */
let shared: Set<string> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
  window.dispatchEvent(new CustomEvent(EVT));
}

function persist(next: Set<string>) {
  shared = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    /* storage full/blocked — saved state just won't persist */
  }
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onEvt = () => cb();
  window.addEventListener(EVT, onEvt);
  return () => {
    listeners.delete(cb);
    window.removeEventListener(EVT, onEvt);
  };
}

function getSnapshot(): Set<string> {
  // Stable reference when empty — getSnapshot must not allocate per call.
  return shared ?? EMPTY;
}

export function useFavorites() {
  const saved = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  // Hydrate from localStorage after mount (SSR HTML = empty = no mismatch).
  useEffect(() => {
    if (shared === null) {
      shared = read();
      emit();
    }
  }, []);

  const toggle = useCallback((id: string) => {
    const next = new Set(shared ?? read());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persist(next);
  }, []);

  const isSaved = useCallback((id: string) => saved.has(id), [saved]);

  return { saved, toggle, isSaved };
}
