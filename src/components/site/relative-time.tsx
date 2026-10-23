"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { de, es, fi, fr, ru } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";

const DATE_FNS_LOCALES = { de, es, fi, fr, ru } as const;
type DateFnsKey = keyof typeof DATE_FNS_LOCALES;

/** Localized "time ago" ("2 tuntia sitten", "vor 2 Stunden", "2 часа назад"...). */
function format(iso: string, locale: string, justNow: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 45_000) return justNow;
  const dfLocale = DATE_FNS_LOCALES[locale as DateFnsKey];
  return formatDistanceToNowStrict(d, {
    ...(dfLocale ? { locale: dfLocale } : {}),
    addSuffix: true,
  });
}

/** Auto-updating relative time label. Re-formats every 30s via a tick. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const locale = useLocale();
  const t = useTranslations("details");
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className={className}>
      {format(iso, locale, t("justNow"))}
    </time>
  );
}
