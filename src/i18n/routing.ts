import { defineRouting } from "next-intl/routing";

/**
 * i18n routing (Task 16) — locales served under /[locale]/, with the
 * default locale (en) unprefixed:  /            -> en (no redirect)
 *                                  /fi/mod/123 -> Finnish mod page
 * Detection order (next-intl): NEXT_LOCALE cookie -> Accept-Language -> en.
 */
export const routing = defineRouting({
  locales: ["en", "fi", "de", "fr", "es", "ru"],
  defaultLocale: "en",
  // "as-needed": default locale has no URL prefix and never redirects to
  // /en/... — all pre-existing routes keep working exactly as before.
  localePrefix: "as-needed",
  // Persist the choice for a year so SSR picks it up on every visit.
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type Locale = (typeof routing.locales)[number];

/** Flag emoji + endonym shown in the header language switcher. */
export const LOCALE_META: Record<Locale, { flag: string; name: string }> = {
  en: { flag: "🇬🇧", name: "English" },
  fi: { flag: "🇫🇮", name: "Suomi" },
  de: { flag: "🇩🇪", name: "Deutsch" },
  fr: { flag: "🇫🇷", name: "Français" },
  es: { flag: "🇪🇸", name: "Español" },
  ru: { flag: "🇷🇺", name: "Русский" },
};
