import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import { describe, expect, it } from "vitest";

import { HTML_LIMITED_BOTS, NEXT_DEFAULT_HTML_LIMITED_BOTS_SOURCE } from "./html-limited-bots";

// Next.js compiles the configured source itself (`new RegExp(source, "i")`,
// server/lib/streaming-metadata.js), so test what it will actually run.
const asNextRuns = new RegExp(HTML_LIMITED_BOTS.source, "i");

const DEFAULT_BOTS = {
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  lighthouse:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
  duckduckbot: "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)",
  yandex: "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
  applebot:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  twitter: "Twitterbot/1.0",
  linkedin: "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  slack: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  discord: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  whatsapp: "WhatsApp/2.23.20.0",
  adsbot: "AdsBot-Google (+http://www.google.com/adsbot.html)",
};

const GOOGLE_BOTS = {
  googlebotSmartphone:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  googlebotDesktop:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/153.0.0.0 Safari/537.36",
  inspectionTool:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)",
};

const BROWSERS = {
  chromeDesktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

describe("HTML_LIMITED_BOTS", () => {
  it("starts from the installed Next.js default, copied verbatim", () => {
    // Fails after a Next.js upgrade that changes the default: copy the new source.
    expect(NEXT_DEFAULT_HTML_LIMITED_BOTS_SOURCE).toBe(HTML_LIMITED_BOT_UA_RE.source);
    expect(HTML_LIMITED_BOTS.source.startsWith(`${HTML_LIMITED_BOT_UA_RE.source}|`)).toBe(true);
  });

  it.each(Object.entries(DEFAULT_BOTS))("still matches a default bot (%s)", (_name, ua) => {
    expect(HTML_LIMITED_BOT_UA_RE.test(ua)).toBe(true);
    expect(asNextRuns.test(ua)).toBe(true);
  });

  it.each(Object.entries(GOOGLE_BOTS))("matches Google's crawler (%s)", (_name, ua) => {
    expect(asNextRuns.test(ua)).toBe(true);
  });

  it("adds Googlebot, which the default leaves out", () => {
    expect(HTML_LIMITED_BOT_UA_RE.test(GOOGLE_BOTS.googlebotSmartphone)).toBe(false);
    expect(asNextRuns.test(GOOGLE_BOTS.googlebotSmartphone)).toBe(true);
  });

  it.each(Object.entries(BROWSERS))("does not match a browser (%s)", (_name, ua) => {
    expect(asNextRuns.test(ua)).toBe(false);
  });
});
