/**
 * Tests for shared UI helpers.
 * Run: bun test src/lib/utils.test.ts
 */
import { describe, expect, test } from "bun:test";
import { formatBytes } from "./utils";

describe("formatBytes", () => {
  test("returns empty string for unknown sizes", () => {
    expect(formatBytes(null)).toBe("");
    expect(formatBytes(undefined)).toBe("");
    expect(formatBytes(-5)).toBe("");
    expect(formatBytes(Number.NaN)).toBe("");
  });
  test("formats bytes and kilobytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
  test("formats megabytes and gigabytes like the UI promises", () => {
    expect(formatBytes(69920160)).toBe("66.7 MB");
    expect(formatBytes(729473741)).toBe("696 MB");
    expect(formatBytes(1_572_864_000)).toBe("1.5 GB");
  });
  test("rounds large values without decimals", () => {
    expect(formatBytes(150_000_000)).toBe("143 MB");
  });
});
