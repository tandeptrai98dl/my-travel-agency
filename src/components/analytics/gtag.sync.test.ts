import { afterEach, describe, expect, it, vi } from "vitest";

import { ALL_ACCEPTED } from "@/lib/consent";

/**
 * `sync()` in a fake browser: what reaches the data layer, the `ga-disable-<id>` switch and the
 * script tag as the route changes after gtag.js has loaded (#55 review backlog), and the
 * document rule of the #55 m4 CSP scoping.
 */

const ID = "G-TEST1234";
const ORIGIN = "https://example.com";

type FakeWindow = {
  location: URL;
  dataLayer?: ArrayLike<unknown>[];
  __ptaAnalytics?: unknown[];
  addEventListener: () => void;
  [flag: string]: unknown;
};

async function browserOpenedOn(landing: string) {
  const scripts: { src?: string }[] = [];
  const win: FakeWindow = { location: new URL(ORIGIN + landing), addEventListener: () => {} };
  let cookie = "";
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookie = value;
    },
    title: "Page",
    referrer: "",
    querySelector: () => null,
    createElement: () => ({}),
    head: { appendChild: (element: { src?: string }) => scripts.push(element) },
  });
  // The URL the document was loaded on (Navigation Timing), whatever the route is now.
  vi.stubGlobal("performance", { now: () => Date.now(), getEntriesByType: (type: string) => (type === "navigation" ? [{ name: ORIGIN + landing }] : []) });
  vi.resetModules();
  const { sync } = await import("./gtag");
  const commands = () => (win.dataLayer ?? []).map((entry) => Array.from(entry));
  const pageViews = () => commands().filter(([kind, name]) => kind === "event" && name === "page_view").length;
  const locations = () =>
    commands()
      .filter(([kind, params]) => kind === "set" && typeof params === "object" && params !== null && "page_location" in params)
      .map(([, params]) => (params as { page_location: string }).page_location);
  const go = (pathname: string, search = "") => {
    win.location = new URL(ORIGIN + pathname + search);
    sync(ID, ALL_ACCEPTED, pathname, search);
  };
  return { win, scripts, commands, pageViews, locations, go, disabled: () => win[`ga-disable-${ID}`] };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sync() after gtag.js has loaded", () => {
  it("switches every hit off on a route without GA and back on where it is allowed", async () => {
    const browser = await browserOpenedOn("/en/checkout/PTA-2611-0042/result");
    browser.go("/en/checkout/PTA-2611-0042/result");
    expect(browser.scripts).toHaveLength(1);
    expect(browser.disabled()).toBe(false);
    expect(browser.pageViews()).toBe(1);

    // A client-side navigation to the account (no GA): hits off, no page view, no second script.
    browser.go("/en/account/bookings/PTA-2611-0042");
    expect(browser.disabled()).toBe(true);
    expect(browser.pageViews()).toBe(1);
    // An emailed-link page (checkout with an `access` query) is off too.
    browser.go("/en/checkout/PTA-2611-0042", "?access=tok");
    expect(browser.disabled()).toBe(true);
    expect(browser.pageViews()).toBe(1);

    // And back to a page where GA is allowed: hits on, one page view with the template only.
    browser.go("/en/tours");
    expect(browser.disabled()).toBe(false);
    expect(browser.pageViews()).toBe(2);
    expect(browser.locations().at(-1)).toBe(`${ORIGIN}/tours`);
    expect(browser.scripts).toHaveLength(1);
    expect(JSON.stringify(browser.commands())).not.toContain("PTA-2611-0042");
  });

  it("re-sends nothing when the same allowed route is synced again", async () => {
    const browser = await browserOpenedOn("/en/tours");
    browser.go("/en/tours");
    browser.go("/en/tours");
    expect(browser.pageViews()).toBe(1);
    expect(browser.disabled()).toBe(false);
  });
});

describe("a document opened on a route without GA", () => {
  it("never loads gtag.js, even after a client-side navigation into checkout", async () => {
    const browser = await browserOpenedOn(`/en/pay/${"t".repeat(43)}`);
    browser.go(`/en/pay/${"t".repeat(43)}`);
    browser.go("/en/checkout/PTA-2611-0042");
    browser.go("/en/checkout/PTA-2611-0042/result");
    expect(browser.scripts).toHaveLength(0);
    expect(browser.commands()).toEqual([]);
    expect(browser.disabled()).toBeUndefined();
  });

  it("is told apart by the URL it was loaded on, not the current route", async () => {
    // Consent given (and the loader imported) only after a client-side navigation away from the
    // account: the document is still the account's, whose policy has no Google host.
    const fromAccount = await browserOpenedOn("/tai-khoan");
    fromAccount.go("/thanh-toan/PTA-2611-0042");
    expect(fromAccount.scripts).toHaveLength(0);

    const fromBook = await browserOpenedOn("/dat-tour/ha-long");
    fromBook.go("/thanh-toan/PTA-2611-0042");
    expect(fromBook.scripts).toHaveLength(1);
    expect(fromBook.pageViews()).toBe(1);
  });
});
