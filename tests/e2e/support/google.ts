import type { BrowserContext, Request } from "@playwright/test";

/**
 * Google Analytics never receives a request from CI (Phase 6 spec step 10). CI builds with a fake
 * measurement ID, and every request to a Google Analytics or Tag Manager host is answered here:
 * gtag.js by a small stand-in that handles the data layer as gtag.js does (consent, `set`,
 * `config`, `event`) and reports each hit as a collect request, with `dl`, `dr` and `dt` defaulting
 * to the real URL, referrer and title exactly as gtag.js does when the site does not set them.
 * It ignores `ga-disable-<id>`, so a test proves that the site itself stops sending.
 */
export const GOOGLE_HOST = /^https:\/\/([a-z0-9-]+\.)*(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)\//;

const FAKE_GTAG = `(function () {
  var dl = (window.dataLayer = window.dataLayer || []);
  var set = {};
  var tid = "";
  function hit(name, params) {
    var p = Object.assign({}, set, params || {});
    var q = new URLSearchParams();
    q.set("v", "2");
    q.set("tid", tid);
    q.set("en", name);
    q.set("dl", p.page_location !== undefined ? p.page_location : location.href);
    q.set("dr", p.page_referrer !== undefined ? p.page_referrer : document.referrer);
    q.set("dt", p.page_title !== undefined ? p.page_title : document.title);
    Object.keys(p).forEach(function (key) {
      if (key === "page_location" || key === "page_referrer" || key === "page_title") return;
      var value = p[key];
      q.set("ep." + key, typeof value === "object" ? JSON.stringify(value) : String(value));
    });
    fetch("https://region1.google-analytics.com/g/collect?" + q.toString(), { method: "POST", mode: "no-cors", keepalive: true });
  }
  function handle(entry) {
    var a = Array.prototype.slice.call(entry);
    if (a[0] === "config") {
      tid = a[1];
      if (!(a[2] && a[2].send_page_view === false)) hit("page_view", {});
    } else if (a[0] === "set" && a[1] && typeof a[1] === "object") {
      Object.assign(set, a[1]);
    } else if (a[0] === "event") {
      hit(a[1], a[2]);
    }
  }
  for (var i = 0; i < dl.length; i += 1) handle(dl[i]);
  var push = dl.push;
  dl.push = function () {
    for (var j = 0; j < arguments.length; j += 1) handle(arguments[j]);
    return push.apply(dl, arguments);
  };
})();`;

export type GoogleTraffic = {
  /** Every request a page made to a Google host, in order. */
  requests: string[];
  /** The collect hits (`/g/collect`) as URLs. */
  hits: () => URL[];
};

/** Answers every Google Analytics request of a browser context locally and records it. */
export async function stubGoogle(context: BrowserContext): Promise<GoogleTraffic> {
  const requests: string[] = [];
  await context.route(GOOGLE_HOST, async (route) => {
    const request: Request = route.request();
    requests.push(request.url());
    if (/\/gtag\/js\b/.test(new URL(request.url()).pathname)) {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_GTAG });
    } else {
      await route.fulfill({ status: 204, body: "" });
    }
  });
  return { requests, hits: () => requests.map((url) => new URL(url)).filter((url) => url.pathname === "/g/collect") };
}
