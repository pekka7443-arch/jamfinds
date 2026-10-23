/**
 * Tests for contentHash slug logic (cross-source duplicate detection).
 * Run: bun test src/lib/slug.test.ts
 */
import { describe, expect, test } from "bun:test";
import { contentSlug, stripSourcePrefix } from "./slug";

describe("contentSlug — basics", () => {
  test("lowercases and joins words with dashes", () => {
    expect(contentSlug("HoLaS Dynamic Backfire")).toBe("holas-dynamic-backfire");
    expect(contentSlug("McLaren Senna")).toBe("mclaren-senna");
  });

  test("punctuation becomes a separator — identical transforms on both sides", () => {
    // Verified best-collision policy on the live catalog (97 cross-source groups):
    // every non letter/number char -> space, so 'Meo's 8.4L' is always 'meo-s-8-4l'
    expect(contentSlug("Meo's 8.4L V10-Revamped")).toBe("meo-s-8-4l-v10-revamped");
    expect(contentSlug("Meo s 8 4L V10 Revamped")).toBe(contentSlug("Meo's 8.4L V10-Revamped"));
    expect(contentSlug("2017 Ford GT V1 confuzzled!")).toBe(contentSlug("2017 ford gt v1 confuzzled"));
    expect(contentSlug("BMW X7 (G07)")).toBe("bmw-x7-g07");
  });

  test("collapses whitespace and trims dashes", () => {
    expect(contentSlug("  HAWAII   map  ")).toBe("hawaii-map");
    expect(contentSlug("Toyota   Tundra")).toBe(contentSlug("toyota tundra"));
  });

  test("normalizes the same mod posted to two sources identically", () => {
    // Real cross-source shapes seen in the catalogs
    expect(contentSlug("2015-2023 Dodge Charger")).toBe(contentSlug("2015 2023 Dodge Charger"));
    expect(contentSlug("Volkswagen Golf MK4")).toBe(contentSlug("volkswagen golf mk4"));
  });

  test("returns empty string when nothing survives (caller stores null)", () => {
    expect(contentSlug("")).toBe("");
    expect(contentSlug("!!!")).toBe("");
    expect(contentSlug("---")).toBe("");
  });
});

describe("contentSlug — source prefix stripping", () => {
  test("strips leading bracket tags like BeamFree's [Upload]", () => {
    expect(contentSlug("[Upload] Lamborghini Countach")).toBe("lamborghini-countach");
    expect(contentSlug("(REQUEST) Liminality v.1.02")).toBe("liminality-v-1-02");
  });

  test("strips subreddit markers", () => {
    expect(contentSlug("r/Beamng_Jamaica - Gavril Scout")).toBe("gavril-scout");
  });

  test("strips site-name headers only when a separator follows", () => {
    expect(contentSlug("BeamFree | Audi A8 D3")).toBe("audi-a8-d3");
    expect(contentSlug("BeamNG.drive - McLaren Senna")).toBe("mclaren-senna");
    // no separator → part of the title, must survive
    expect(contentSlug("Beamng Volumetric Backfire Mod")).toBe("beamng-volumetric-backfire-mod");
    expect(contentSlug("Beam iPhone")).toBe("beam-iphone");
  });

  test("bracket tag stripping is a leading-only transform", () => {
    // A trailing version chip stays (both sides transform identically)
    expect(contentSlug("Toyota Tundra [1.48]")).toBe("toyota-tundra-1-48");
  });

  test("exposes stripSourcePrefix for direct assertions", () => {
    expect(stripSourcePrefix("[Upload] Honda NSX")).toBe("Honda NSX");
    expect(stripSourcePrefix("HAWAII")).toBe("HAWAII");
  });
});

describe("contentSlug — base64 code titles (subreddit convention)", () => {
  test("base64 codes in titles are stripped before slugging", () => {
    const t = "aHR0cHM6Ly9tb2RzZmlyZS5jb20vQjYyOTRpNDREcTJHZjRo Dodge Charger Hellcat";
    expect(contentSlug(t)).toBe("dodge-charger-hellcat");
    expect(contentSlug(t)).toBe(contentSlug("Dodge Charger Hellcat"));
  });
});
