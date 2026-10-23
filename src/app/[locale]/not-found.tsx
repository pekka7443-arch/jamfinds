"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Localized 404 for every route under /[locale] (Task 16) — unmatched paths
 * are internally rewritten into the [locale] segment by the next-intl proxy,
 * so this boundary covers /xyz and /fi/xyz alike.
 */
export default function NotFoundPage() {
  const t = useTranslations("notFound");

  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
        <Compass className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      </span>
      <div>
        <p className="tt-h2 text-foreground">{t("title")}</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{t("body")}</p>
      </div>
      <Button variant="outline" className="mt-1 h-10" asChild>
        <Link href="/">{t("back")}</Link>
      </Button>
    </main>
  );
}
