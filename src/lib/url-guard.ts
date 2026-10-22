/**
 * Outbound URL safety — used by the download proxy and resolvers.
 *
 * Every URL the server is about to FETCH (initial target, resolver-produced
 * stream URLs, and every redirect hop) must pass `assertPublicUrl`:
 *   - https only (no http:, no file:, data:, ftp:...)
 *   - no embedded credentials (https://user@host/ tricks)
 *   - no hostnames that resolve inside the server's own network:
 *     localhost, *.local, *.internal, cloud metadata endpoints, and
 *     private / link-local / loopback / CGNAT / benchmark IP literals
 *     (both IPv4 and IPv6, incl. ::ffff: mapped forms).
 *
 * DNS-rebinding (public hostname resolving to a private IP) cannot be fully
 * prevented without a custom resolver; hostname-level blocklisting plus the
 * strict file-host allowlist in resolvers.ts covers the realistic attack
 * surface for this deployment. Documented as a remaining risk.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "169.254.169.254",
]);

/** IPv4 literal private/reserved ranges worth blocking (SSRF). */
function isPrivateIPv4(host: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const parts = host.split(".").map(Number);
  if (parts.some((n) => Number.isNaN(n) || n > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/** IPv6 literal private/reserved forms worth blocking (SSRF). */
function isPrivateIPv6(rawHost: string): boolean {
  // URL.hostname keeps brackets for IPv6 literals: "[::1]" -> "::1",
  // and normalizes to compressed form ("::ffff:10.0.0.1" -> "::ffff:a00:1").
  const host = rawHost.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(":")) return false;
  if (host === "::" || host === "::1") return true; // unspecified + loopback
  // IPv4-mapped addresses — handle both the dotted form and the
  // URL-normalized hex form (::ffff:a00:1 = ::ffff:10.0.0.1).
  if (host.startsWith("::ffff:")) {
    const tail = host.slice(7);
    if (tail.includes(".")) {
      if (isPrivateIPv4(tail)) return true;
    } else {
      const groups = tail.split(":").filter(Boolean);
      if (groups.length === 2) {
        const n3 = parseInt(groups[0], 16);
        const n4 = parseInt(groups[1], 16);
        if (!Number.isNaN(n3) && !Number.isNaN(n4)) {
          if (isPrivateIPv4(`${n3 >> 8}.${n3 & 255}.${n4 >> 8}.${n4 & 255}`)) return true;
        }
      }
    }
  }
  const first = host.split(":")[0];
  const h16 = parseInt(first, 16);
  if (Number.isNaN(h16)) return false;
  if ((h16 & 0xff00) === 0xfe00) return true; // fe80::/10 link-local (+ reserved fe00::)
  if ((h16 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  return false;
}

/**
 * True when the URL must NOT be fetched by the server.
 * Also flags non-https protocols and embedded credentials.
 */
export function isInternalTarget(u: URL): boolean {
  if (u.protocol !== "https:") return true;
  if (u.username || u.password) return true;
  // Trailing-dot FQDN ("localhost.") bypasses naive equality — normalize.
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  return isPrivateIPv4(host) || isPrivateIPv6(host);
}

/**
 * Parse + validate a URL the server is about to fetch.
 * Returns the parsed URL or throws with a short, safe reason.
 */
export function assertPublicUrl(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("malformed url");
  }
  if (isInternalTarget(u)) throw new Error("url target is not fetchable");
  return u;
}

/**
 * Validate a URL we may 307-redirect the BROWSER to (never fetched by us).
 * Slightly different policy: https + no credentials + no internal hosts,
 * since browsers resolve those on the visitor's machine (still dangerous
 * for intranet-punching links).
 */
export function safeRedirectTarget(url: string): string | null {
  try {
    const u = new URL(url);
    if (isInternalTarget(u)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
