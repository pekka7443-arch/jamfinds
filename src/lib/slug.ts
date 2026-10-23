/**
 * contentHash — cross-source duplicate detection for mods.
 *
 * The same BeamNG mod is often posted to several sources (BeamFinds +
 * BeamFree catalogs, plus a subreddit release thread). To recognize those
 * as one mod we reduce every entry to a content slug built from the
 * ORIGINAL raw title:
 *
 *   contentSlug(rawTitle) = slug( stripSourcePrefix( cleanTitle(rawTitle) ) )
 *
 *  - cleanTitle() strips base64 link codes (subreddit convention)
 *  - stripSourcePrefix() removes source-site tagging that is not part of
 *    the mod's name: leading "[Upload]"/"(REQUEST)" chips, "r/sub" markers
 *    and "SiteName |/- Mod" headers (separator required, so plain titles
 *    that merely START with a word like "Beam" are never touched)
 *  - slug: lowercase, drop ALL punctuation, collapse whitespace, join
 *    with "-" → "holas-dynamic-backfire"
 *
 * Both sides of a comparison receive the identical transform, so removing
 * dots/hyphens consistently is what makes "Ford F-150" and "Ford F 150"
 * collide — that is the point. Pure + client-safe.
 */

import { cleanTitle } from "@/lib/links"

/** Max stored slug length — titles are capped at 300 chars, slugs at 160. */
const MAX_SLUG_LEN = 160

/**
 * Source-site prefixes that are not part of the mod's name.
 * Kept deliberately narrow:
 *  - a leading bracket/paren tag of at most 40 chars: "[Upload] X", "(REQUEST) X"
 *  - a leading "r/subreddit" marker
 *  - a known site name ONLY when followed by a separator (| - : >) — so
 *    "Beamng Volumetric Backfire Mod" or "Beam iPhone" survive untouched.
 */
export function stripSourcePrefix(title: string): string {
  let t = title.trim()
  // Leading bracketed/parenthesized tag, e.g. "[Upload]", "(REQUEST)", "[1.48]"
  t = t.replace(/^[\[(][^\])]{0,40}[\])]\s*/, "")
  // Leading subreddit marker, e.g. "r/Beamng_Jamaica - Mod name"
  t = t.replace(/^r\/[\w-]+\s*[-:|>]\s*/i, "")
  // Site-name header followed by an explicit separator
  t = t.replace(/^(beamfinds|beamfree|beamng\.drive|beamng|reddit)\s*[-:|>]\s*/i, "")
  return t.trim()
}

/**
 * Reduce a raw title to its content slug. Returns "" when nothing
 * letter/number-shaped survives (caller stores null).
 */
export function contentSlug(rawTitle: string): string {
  const stripped = stripSourcePrefix(cleanTitle(rawTitle ?? ""))
  const slug = stripped
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // drop all punctuation (incl. dots, hyphens)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LEN)
    .replace(/-+$/g, "")
  return slug
}
