import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Task 16 i18n message-parity tests — every locale must expose the exact
 * same key set as the English master (so a missing translation can never
 * render a raw message key), keep ICU placeholder usage aligned, and never
 * contain empty strings.
 */

const MESSAGES_DIR = join(import.meta.dir, "..", "..", "messages");
const LOCALES = ["en", "fi", "de", "fr", "es", "ru"] as const;

type Json = Record<string, unknown>;

function flatten(obj: Json, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") return flatten(v as Json, key);
    return [key];
  });
}

function load(locale: string): Json {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf-8"));
}

function getAt(obj: Json, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => (acc as Json | undefined)?.[part], obj);
}

/** Extract ICU argument names from a message (params, plurals, selects). */
function icuArgs(message: string): string[] {
  const args: string[] = [];
  const re = /\{(\w+)\s*,\s*(?:plural|select|number|date|time)|\{(\w+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message))) args.push(m[1] ?? m[2]);
  return args.sort();
}

describe("i18n messages", () => {
  const en = load("en");
  const enKeys = flatten(en).sort();

  test("English master parses and is non-trivial", () => {
    expect(enKeys.length).toBeGreaterThan(120);
  });

  for (const locale of LOCALES.slice(1)) {
    test(`${locale}: same key set as en`, () => {
      const keys = flatten(load(locale)).sort();
      const missing = enKeys.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !enKeys.includes(k));
      if (missing.length || extra.length) {
        throw new Error(`${locale} mismatch — missing: ${missing.join(", ")} | extra: ${extra.join(", ")}`);
      }
      expect(keys.length).toBe(enKeys.length);
    });
  }

  for (const locale of LOCALES) {
    test(`${locale}: ICU placeholders match en per key`, () => {
      const loc = load(locale);
      for (const key of enKeys) {
        const enVal = getAt(en, key);
        const locVal = getAt(loc, key);
        if (typeof enVal === "string" && typeof locVal === "string") {
          const expected = icuArgs(enVal).join();
          const actual = icuArgs(locVal).join();
          if (expected !== actual) {
            throw new Error(`${locale} "${key}" ICU args [${actual}] != en [${expected}]`);
          }
        }
      }
      expect(true).toBe(true);
    });

    test(`${locale}: every string non-empty`, () => {
      for (const key of enKeys) {
        const val = getAt(load(locale), key);
        expect(typeof val === "string" && (val as string).trim().length > 0).toBe(true);
      }
    });
  }

  test("plural-bearing messages use ICU plural in every locale", () => {
    const pluralKeys = ["filters.results", "card.onSources", "home.newModsToast", "home.syncedToast", "hero.statModsHint"];
    for (const locale of LOCALES) {
      for (const key of pluralKeys) {
        const val = getAt(load(locale), key) as string;
        expect(val.includes(", plural,")).toBe(true);
      }
    }
  });

  test("russian messages include few/many plural forms", () => {
    const ru = load("ru");
    expect(getAt(ru, "filters.results")).toContain("few {");
    expect(getAt(ru, "filters.results")).toContain("many {");
  });
});
