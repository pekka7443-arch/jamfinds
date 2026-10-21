/**
 * Minimal Reddit RSS (Atom) fetcher + parser.
 *
 * Reddit's public JSON API is heavily blocked (403), but the RSS feed at
 * https://www.reddit.com/r/{sub}/new/.rss works with a browser-like UA.
 * We therefore poll the RSS feeds, parse entries and extract everything
 * we need: id, title, author, permalink, published date, body html,
 * thumbnails and inline images.
 */

export interface FeedEntry {
  id: string // t3_xxx
  source: string // subreddit name
  title: string
  author: string
  permalink: string
  publishedAt: Date
  contentHtml: string // unescaped html of post body
  thumbnail: string | null
  images: string[] // image urls found in the body
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&")
}

/** Strip HTML tags to get readable plain text (keeps external link hrefs as "[url]"). */
export function htmlToText(html: string): string {
  let out = html
  // Drop reddit navigation anchors ([link], [comments], /u/...) — pure feed boilerplate
  out = out.replace(/<a\s[^>]*href="https?:\/\/(?:[\w-]+\.)*reddit\.com\/[^"]*"[^>]*>[\s\S]*?<\/a>/gi, "")
  out = out.replace(/<a\s[^>]*href="https?:\/\/(?:[\w-]+\.)*redd\.it\/[^"]*"[^>]*>[\s\S]*?<\/a>/gi, "")
  // Keep hrefs of remaining (external) anchors before dropping tags
  out = out.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
    const txt = inner.replace(/<[^>]+>/g, "").trim()
    return href && !txt.includes(href) ? `${txt} ${href}` : txt
  })
  out = out.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
  out = out.replace(/<[^>]+>/g, " ")
  out = decodeEntities(out)
  // drop the boilerplate tail ("submitted by /u/x")
  out = out.replace(/\s*submitted by\s*[\s\S]*$/i, " ")
  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
}

/** Extract candidate image urls from post body html. */
export function extractImages(html: string): string[] {
  const urls = new Set<string>()
  for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]*(?:redd\.it|redditmedia\.com)[^"]*)"/gi)) {
    const url = decodeEntities(m[1])
    if (/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) || url.includes("preview.redd.it") || url.includes("i.redd.it")) {
      urls.add(url.split("&amp;")[0].length > 10 ? url : url)
    }
  }
  return [...urls].slice(0, 6)
}

/** Parse an Atom feed string into entries. */
export function parseAtomFeed(xml: string, source: string): FeedEntry[] {
  const entries: FeedEntry[] = []
  const blocks = xml.split(/<entry>/).slice(1)
  for (const block of blocks) {
    const body = block.split("</entry>")[0]
    try {
      const id = decodeEntities(body.match(/<id>([^<]+)<\/id>/)?.[1] ?? "")
      if (!id || !id.startsWith("t3_")) continue

      const title = decodeEntities(body.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim()
      const author = decodeEntities(body.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/)?.[1] ?? "unknown")
        .replace(/^\/?u\//, "")
      const permalink = decodeEntities(body.match(/<link[^>]*href="([^"]+)"[^>]*\/>/)?.[1] ?? "")
      const publishedRaw =
        body.match(/<published>([^<]+)<\/published>/)?.[1] ?? body.match(/<updated>([^<]+)<\/updated>/)?.[1] ?? ""
      const publishedAt = publishedRaw ? new Date(publishedRaw) : new Date()
      if (isNaN(publishedAt.getTime())) publishedAt.setTime(Date.now())

      const contentRaw = body.match(/<content type="html">([\s\S]*?)<\/content>/)?.[1] ?? ""
      const contentHtml = decodeEntities(contentRaw)

      const thumbMatch = body.match(/<media:thumbnail[^>]*url="([^"]+)"/)
      const thumbnail = thumbMatch ? decodeEntities(thumbMatch[1]) : null

      const images = extractImages(contentHtml)

      entries.push({ id, source, title, author, permalink, publishedAt, contentHtml, thumbnail, images })
    } catch {
      // skip malformed entry
    }
  }
  return entries
}

export class RedditFetchError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Fetch the "new" RSS feed of a subreddit. Throws RedditFetchError on HTTP errors. */
export async function fetchSubredditFeed(sub: string, limit = 100): Promise<FeedEntry[]> {
  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/new/.rss?limit=${limit}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      cache: "no-store",
    })
    if (res.status === 429) {
      throw new RedditFetchError(429, "Reddit rate limit hit (429)")
    }
    if (!res.ok) {
      throw new RedditFetchError(res.status, `Reddit feed HTTP ${res.status} for r/${sub}`)
    }
    const xml = await res.text()
    if (!xml.includes("<entry>")) {
      // Reddit sometimes answers 200 with an HTML block/challenge page.
      if (/<html|<!DOCTYPE/i.test(xml)) {
        throw new RedditFetchError(503, `Reddit served a block page for r/${sub}`)
      }
      return []
    }
    return parseAtomFeed(xml, sub)
  } catch (err) {
    if (err instanceof RedditFetchError) throw err
    if ((err as Error).name === "AbortError") {
      throw new RedditFetchError(0, `Timeout fetching r/${sub}`)
    }
    throw new RedditFetchError(0, (err as Error).message || `Unknown error fetching r/${sub}`)
  } finally {
    clearTimeout(timer)
  }
}
