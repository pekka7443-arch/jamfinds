import { setRequestLocale } from "next-intl/server";
import Home from "@/components/site/home";

/**
 * Homepage under /[locale] (Task 16). The default locale (en) is served
 * without a prefix at / — the next-intl proxy rewrites it internally to
 * /en so this segment handles every language.
 */
interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function LocaleHomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Home />;
}
