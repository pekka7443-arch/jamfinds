/**
 * Unit tests for link classification + extraction and download-link rules.
 * Run: bun test src/lib/links.test.ts
 */
import { describe, expect, test } from "bun:test";
import { classifyUrl, cleanTitle, extractLinks } from "./links";
import { hasDownloadLink, isDownloadLink } from "./types";

describe("classifyUrl", () => {
  test("classifies known hosts", () => {
    expect(classifyUrl("https://modsfire.com/abc").host).toBe("modsfire");
    expect(classifyUrl("https://www.mediafire.com/file/x/y.zip").host).toBe("mediafire");
    expect(classifyUrl("https://drive.google.com/file/d/ID/view").host).toBe("gdrive");
    expect(classifyUrl("https://docs.google.com/uc?id=ID").host).toBe("gdrive");
    expect(classifyUrl("https://pixeldrain.com/u/abc").host).toBe("pixeldrain");
    expect(classifyUrl("https://beamfinds.com/mod/831").host).toBe("beamfinds");
    expect(classifyUrl("https://beamfree.pro/mod/84").host).toBe("beamfree");
    expect(classifyUrl("https://discord.gg/join").host).toBe("discord");
  });

  test("host-suffix matching cannot be fooled by lookalike domains", () => {
    // evilmodsfire.com ends with "modsfire.com" as a substring but NOT as a
    // domain suffix — hostname equality/suffix must be exact-label based.
    expect(classifyUrl("https://evildrive.google.com/").host).toBe("other");
    expect(classifyUrl("https://notmodsfire.com/").host).toBe("other");
  });

  test("returns other for arbitrary hosts and garbage", () => {
    expect(classifyUrl("https://example.com/x").host).toBe("other");
    expect(classifyUrl("::garbage::").host).toBe("other");
  });
});

describe("extractLinks", () => {
  test("finds plain urls and dedupes", () => {
    const links = extractLinks("grab it https://modsfire.com/abc (mirror: https://modsfire.com/abc)");
    expect(links.length).toBe(1);
    expect(links[0].host).toBe("modsfire");
    expect(links[0].decoded).toBe(false);
  });

  test("splits glued urls", () => {
    const links = extractLinks("https://modsfire.com/a1https://modsfire.com/b2");
    expect(links.length).toBe(2);
  });

  test("decodes base64-encoded links", () => {
    const b64 = Buffer.from("https://modsfire.com/B6294i44Dq2Gf4h", "utf-8").toString("base64");
    const links = extractLinks(`new drop ${b64}`);
    expect(links.length).toBe(1);
    expect(links[0].decoded).toBe(true);
    expect(links[0].host).toBe("modsfire");
  });

  test("ignores base64 tokens that do not decode to urls", () => {
    const links = extractLinks("just a token aaaaaaaaaaaaaaaaaaaa and https://modsfire.com/x");
    expect(links.length).toBe(1);
  });
});

describe("cleanTitle", () => {
  test("strips base64 url codes from titles", () => {
    const b64 = Buffer.from("https://modsfire.com/abc", "utf-8").toString("base64");
    expect(cleanTitle(`Porsche 911 GT3 ${b64}`)).toBe("Porsche 911 GT3");
  });

  test("keeps normal titles untouched", () => {
    expect(cleanTitle("East Coast USA Remastered v2")).toBe("East Coast USA Remastered v2");
  });
});

describe("download-link rules (Task 8: categories = working mods only)", () => {
  test("file hosts count as download links", () => {
    expect(isDownloadLink({ host: "modsfire", url: "https://modsfire.com/x" })).toBe(true);
    expect(isDownloadLink({ host: "beamfinds", url: "https://beamfinds.com/mod/831" })).toBe(true);
  });

  test("real file hosts reported as 'other' still count via url pattern", () => {
    expect(isDownloadLink({ host: "other", url: "https://cdn.discordapp.com/attachments/1/2/f.zip" })).toBe(true);
    expect(isDownloadLink({ host: "other", url: "https://modland.net/f.zip" })).toBe(true);
  });

  test("patreon/ko-fi/youtube/discord-invite pages never count", () => {
    expect(isDownloadLink({ host: "other", url: "https://www.patreon.com/someone" })).toBe(false);
    expect(isDownloadLink({ host: "other", url: "https://ko-fi.com/someone" })).toBe(false);
    expect(isDownloadLink({ host: "other", url: "https://youtube.com/watch?v=x" })).toBe(false);
    expect(isDownloadLink({ host: "discord", url: "https://discord.gg/abc" })).toBe(false);
  });

  test("hasDownloadLink is true only when at least one link qualifies", () => {
    expect(hasDownloadLink([{ host: "other", url: "https://patreon.com/x" }])).toBe(false);
    expect(
      hasDownloadLink([
        { host: "other", url: "https://patreon.com/x" },
        { host: "mediafire", url: "https://mediafire.com/f" },
      ]),
    ).toBe(true);
  });
});
