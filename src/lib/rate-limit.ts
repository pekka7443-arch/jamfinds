/**
 * Tiny in-memory sliding-window rate limiter for public API routes.
 *
 * Per-key (scope + client IP) token history, pruned lazily. Single-instance
 * protection against bandwidth abuse on /api/download, forced sync spam on
 * /api/sync and resolver-scraping storms on /api/download/resolve.
 *
 * Note: state lives in this process only. The app is deployed as a single
 * Next.js server behind the gateway proxy, where the gateway sets
 * x-forwarded-for. A multi-instance deployment would need a shared store.
 */

import type { NextRequest } from "next/server";

const buckets = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  retryAfterS: number;
  remaining: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterS: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)), remaining: 0 };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Lazy prune — keeps the map bounded without a background timer.
  if (buckets.size > MAX_KEYS) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
      if (buckets.size <= MAX_KEYS / 2) break;
    }
  }

  return { ok: true, retryAfterS: 0, remaining: limit - hits.length };
}

/** Best-effort client IP behind the gateway proxy (x-forwarded-for first hop). */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Scoped limiter key, e.g. "dl:1.2.3.4". */
export function limitKey(scope: string, req: NextRequest): string {
  return `${scope}:${clientIp(req)}`;
}

/** Standard 429 JSON response with Retry-After. */
export function tooManyRequests(retryAfterS: number): Response {
  return Response.json(
    { error: "Too many requests — slow down a little." },
    { status: 429, headers: { "Retry-After": String(retryAfterS), "Cache-Control": "no-store" } },
  );
}
