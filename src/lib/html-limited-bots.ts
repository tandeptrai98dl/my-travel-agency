// User agents that get blocking metadata in <head> (next.config.ts `htmlLimitedBots`).
//
// Next.js streams metadata after the shell for every other user agent. On pages that read
// `searchParams` (`/tours`, `/tim-kiem`) that puts the canonical, hreflang and `noindex` in
// <body>, where Google ignores a `rel=canonical`. Googlebot is not in Next's default list (it
// is treated as a JavaScript-running "DOM" bot), so it is added here. The cost: a matching
// request skips the prerendered shell and renders on the server (about 40 ms instead of about
// 6 ms to the first byte on a local production build). See ARCHITECTURE.md "SEO" and ADR-041.

/**
 * Next.js 16.4.5's default `HTML_LIMITED_BOT_UA_RE` source, copied verbatim from
 * `next/dist/shared/lib/router/utils/html-bots.js`: setting `htmlLimitedBots` replaces the
 * default, so the default has to be kept by hand. A unit test fails when an upgrade changes it.
 */
export const NEXT_DEFAULT_HTML_LIMITED_BOTS_SOURCE =
  "[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight";

/**
 * Google's search crawler and Search Console's URL Inspection. `Google-InspectionTool` is
 * already matched by the default's `Google-[\w-]+`; it is listed so the intent survives a
 * change to the default.
 */
const GOOGLE_BOTS = ["Googlebot", "Google-InspectionTool"];

/**
 * Next.js reads only the `source` and compiles it case-insensitively
 * (`server/lib/streaming-metadata.js`), so the `i` flag here matches its behaviour.
 */
export const HTML_LIMITED_BOTS = new RegExp(
  `${NEXT_DEFAULT_HTML_LIMITED_BOTS_SOURCE}|${GOOGLE_BOTS.join("|")}`,
  "i",
);
