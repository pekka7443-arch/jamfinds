/**
 * Brand configuration — the single place to rename or retune the product.
 *
 * Naming evaluation: kept "JamFinds" — short, memorable, unique in
 * the BeamNG scene, and "finds" describes exactly what the site does. The
 * visual identity is "Violet Ink": near-black charcoal surfaces with a
 * single refined violet accent (see globals.css). Changing BRAND here
 * updates metadata, header, hero and footer together.
 */

export const BRAND = {
  name: "JamFinds",
  /** Wordmark split for the two-tone header/footer rendering. */
  nameFirst: "Jam",
  nameSecond: "Finds",
  tagline: "Every BeamNG mod drop, the second it lands.",
  description:
    "A live BeamNG.drive mod finder. Automatically syncs new releases from r/Beamng_Jamaica, r/BeamNGpiratemods, r/beamng_leakedmods, r/BeamNG_Leaked_M0ds, BeamFinds and BeamFree — and auto-decodes base64 download links in real time.",
  legalName: "JamFinds — unofficial live index of BeamNG.drive mods",
} as const;
