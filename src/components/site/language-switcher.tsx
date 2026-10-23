"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { routing, LOCALE_META, type Locale } from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";

const LS_LOCALE = "jamfinds:locale";

function persistLocale(locale: Locale) {
  // localStorage for the client, cookie for SSR (next-intl reads NEXT_LOCALE).
  try {
    window.localStorage.setItem(LS_LOCALE, locale);
  } catch {
    // private mode etc. — switching still works for this page view
  }
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

function readStoredLocale(): Locale | null {
  try {
    const stored = window.localStorage.getItem(LS_LOCALE) as Locale | null;
    return stored && routing.locales.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Language switcher (Task 16) — flag emoji + language endonym, one entry per
 * supported locale. Persists the choice to localStorage AND the NEXT_LOCALE
 * cookie, then soft-navigates to the same page in the new locale so SSR
 * matches on the next visit. The active locale comes from useLocale(), so
 * the selection stays in sync automatically after each navigation.
 */
export function LanguageSwitcher() {
  const t = useTranslations("header");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();

  const switchTo = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      persistLocale(next);
      router.replace(pathname, { locale: next });
    },
    [locale, pathname, router],
  );

  // Honor a localStorage choice if the cookie was lost (e.g. cleared between
  // visits) — without this the UI language would silently fall back.
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) return;
      const stored = readStoredLocale();
      if (stored && stored !== locale && !document.cookie.includes("NEXT_LOCALE=")) {
        persistLocale(stored);
        router.replace(pathname, { locale: stored });
      }
    },
    [locale, pathname, router],
  );

  const meta = LOCALE_META[locale] ?? LOCALE_META.en;

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label={t("language")}
        title={t("language")}
        className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 text-xs text-muted-foreground outline-none transition-colors duration-150 hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
      >
        <Languages className="h-3.5 w-3.5" aria-hidden="true" />
        <span aria-hidden="true">{meta.flag}</span>
        <span className="hidden md:inline">{meta.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {routing.locales.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => switchTo(l)}
            className={`gap-2 ${l === locale ? "text-primary" : ""}`}
          >
            <span aria-hidden="true" className="text-sm">
              {LOCALE_META[l].flag}
            </span>
            <span className="flex-1">{LOCALE_META[l].name}</span>
            {l === locale && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
