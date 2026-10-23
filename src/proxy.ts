import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Locale negotiation (Task 16) — Next.js 16 "proxy" convention (the
 * successor of middleware.ts). Handles:
 *  - locale detection: NEXT_LOCALE cookie -> Accept-Language -> default en
 *  - /fi/... prefixed paths are served as-is; the default locale keeps its
 *    unprefixed URLs (localePrefix "as-needed"), so every pre-existing
 *    route (/ and /mod/[id]) keeps working without a locale prefix.
 * API routes, _next internals and anything with a file extension
 * (sw.js, logo.svg, robots.txt) are excluded below.
 */
export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for
  //  - … those starting with `/api`, `/trpc`, `/_next` or `/_vercel`
  //  - … the ones containing a dot (e.g. `sw.js`, `favicon.ico`)
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
