/**
 * Brand configuration — the single place to rename or retune the product.
 *
 * Naming evaluation (Task 9): kept "JamFinds" — short, memorable, unique in
 * the BeamNG scene, and "finds" describes exactly what the site does. The
 * Jamaica-inspired green/gold palette stays as the founding story of the
 * site (r/Beamng_Jamaica was the first source). Changing BRAND here updates
 * metadata, header, hero and footer together.
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
