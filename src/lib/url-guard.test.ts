/**
 * Security regression tests for the outbound URL guards used by the
 * download proxy. Run: bun test src/lib/url-guard.test.ts
 */
import { describe, expect, test } from "bun:test";
import { assertPublicUrl, isInternalTarget, safeRedirectTarget } from "./url-guard";

describe("isInternalTarget", () => {
  const blocked = [
    "http://modsfire.com/abc", // not https
    "ftp://modsfire.com/abc", // wrong scheme
    "https://localhost/abc",
    "https://localhost:3000/abc",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://169.254.169.254/latest/meta-data/", // cloud metadata
    "https://10.0.0.1/abc", // private v4
    "https://192.168.1.10/abc",
    "https://172.16.0.5/abc",
    "https://172.31.255.1/abc",
    "https://127.0.0.1/abc",
    "https://0.0.0.0/abc",
    "https://100.64.0.1/abc", // CGNAT
    "https://[::1]/abc", // v6 loopback
    "https://[fe80::1]/abc", // v6 link-local
    "https://[fc00::1]/abc", // v6 unique-local
    "https://[fd12:3456::1]/abc",
    "https://[::ffff:10.0.0.1]/abc", // v4-mapped private
    "https://user@modsfire.com/abc", // embedded credentials
    "https://myserver.local/abc",
    "https://box.internal/abc",
  ];

  for (const url of blocked) {
    test(`blocks ${url}`, () => {
      expect(isInternalTarget(new URL(url))).toBe(true);
    });
  }

  const allowed = [
    "https://modsfire.com/B6294i44Dq2Gf4h",
    "https://cdn.discordapp.com/attachments/1/2/file.zip",
    "https://drive.usercontent.google.com/download?id=x",
    "https://r2.modsfire.com/d/abc?p=xyz", // subdomain of a file host
    "https://8.8.8.8/abc", // public IP literal
    "https://[2606:4700::1]/abc", // public v6
  ];

  for (const url of allowed) {
    test(`allows ${url}`, () => {
      expect(isInternalTarget(new URL(url))).toBe(false);
    });
  }
});

describe("assertPublicUrl", () => {
  test("returns a parsed URL for valid public targets", () => {
    const u = assertPublicUrl("https://modsfire.com/abc");
    expect(u.hostname).toBe("modsfire.com");
  });

  test("throws on malformed urls", () => {
    expect(() => assertPublicUrl("not a url")).toThrow();
  });

  test("throws on internal targets", () => {
    expect(() => assertPublicUrl("https://localhost/x")).toThrow();
    expect(() => assertPublicUrl("https://10.1.2.3/x")).toThrow();
  });

  test("blocks trailing-dot localhost bypass", () => {
    expect(() => assertPublicUrl("https://localhost./x")).toThrow();
  });
});

describe("safeRedirectTarget", () => {
  test("returns the url for public https targets", () => {
    expect(safeRedirectTarget("https://modland.net/x.zip")).toBe("https://modland.net/x.zip");
  });

  test("returns null for internal or malformed targets", () => {
    expect(safeRedirectTarget("https://192.168.0.1/admin")).toBeNull();
    expect(safeRedirectTarget("javascript:alert(1)")).toBeNull();
    expect(safeRedirectTarget("nope")).toBeNull();
  });
});
