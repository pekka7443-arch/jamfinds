import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

/**
 * Locale-scoped catch-all (Task 16): unmatched paths are internally
 * rewritten into the [locale] segment by the next-intl proxy, and this
 * route turns them into notFound() so the LOCALIZED [locale]/not-found
 * boundary renders instead of Next's default global 404.
 */
export default async function CatchAllNotFound({
  params,
}: {
  params: Promise<{ locale: string; rest: string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  notFound();
}
