import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware wrappers around Next.js navigation APIs — use these instead
 * of next/link & next/navigation when linking between app pages so the
 * active locale prefix is preserved (e.g. /fi/mod/123 stays Finnish).
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
