/**
 * The gtag.js loader (Phase 6 spec decision 7, ADR-039), imported dynamically by `Analytics` only
 * once the visitor has granted "analytics", so neither this file nor Google's script is part of
 * the initial JavaScript. Consent Mode v2, standard sequence: every signal defaults to denied with
 * `ads_data_redaction`, the `update` grants `analytics_storage` (and the `ad_*` signals only with
 * "marketing"), and only then `config` runs with `send_page_view: false` and the script loads.
 * Page views are sent by hand with the route template, never the real path or query.
 */
import type { ConsentChoice } from "@/lib/consent";

import { analyticsAllowed, pageInfo, pageLocation, pageReferrer, pageTitle } from "./routes";
import { scrubParams } from "./scrub";
import { ANALYTICS_EVENT, type AnalyticsEvent, type QueuedEvent } from "./track";

export type LoaderState = "idle" | "active" | "withdrawn";
export type GtagCommand = [string, ...unknown[]];

const DENIED = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" } as const;

function granted(choice: ConsentChoice) {
  const ads = choice.marketing ? "granted" : "denied";
  return { analytics_storage: "granted", ad_storage: ads, ad_user_data: ads, ad_personalization: ads };
}

export type ConsentPlan = {
  next: LoaderState;
  commands: GtagCommand[];
  /** Inject gtag.js (first grant only). */
  loadScript: boolean;
  /** `window["ga-disable-<id>"]`: true stops every hit, false resumes. */
  disable?: boolean;
  /** Remove the `_ga*` cookies. */
  clearCookies: boolean;
};

/** The consent state machine: what to tell gtag for a choice, from the loader's current state. */
export function consentPlan(state: LoaderState, choice: ConsentChoice, measurementId: string, now: Date = new Date()): ConsentPlan {
  if (!choice.analytics) {
    if (state === "active") return { next: "withdrawn", commands: [["consent", "update", { ...DENIED }]], loadScript: false, disable: true, clearCookies: true };
    return { next: state, commands: [], loadScript: false, clearCookies: true };
  }
  if (state === "idle") {
    return {
      next: "active",
      commands: [
        ["consent", "default", { ...DENIED }],
        ["set", "ads_data_redaction", true],
        ["consent", "update", granted(choice)],
        ["js", now],
        ["config", measurementId, { send_page_view: false }],
      ],
      loadScript: true,
      clearCookies: false,
    };
  }
  return { next: "active", commands: [["consent", "update", granted(choice)]], loadScript: false, disable: state === "withdrawn" ? false : undefined, clearCookies: false };
}

/** What `page_view` sends for a page: templates only. */
export function pageViewCommands(input: { origin: string; pathname: string; title: string; referrer: string }): GtagCommand[] {
  return [
    ["set", { page_location: pageLocation(input.origin, input.pathname), page_referrer: input.referrer, page_title: pageTitle(input.title, input.pathname) }],
    ["event", "page_view", { site_language: pageInfo(input.pathname).locale }],
  ];
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let state: LoaderState = "idle";
let measurement = "";
let viewedPath: string | null = null;
let lastLocation: string | null = null;
let pageAllowed = false;
let listening = false;

// gtag.js reads `arguments` objects from the data layer, exactly as Google's snippet pushes them.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]) {
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer!.push(arguments);
}

function run(commands: GtagCommand[]) {
  for (const command of commands) gtag(...command);
}

function loadScript(id: string) {
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  // Secure pages (book, checkout, result) allow scripts by the request nonce (ADR-027).
  const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
  if (nonce) script.nonce = nonce;
  document.head.appendChild(script);
}

/** Removes Google cookies (`_ga`, `_ga_<id>`, and the ads `_gcl_*`) on this host and its parent domains. */
export function deleteGaCookies() {
  const names = document.cookie
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter((name) => name.startsWith("_ga") || name.startsWith("_gcl"));
  if (!names.length) return;
  const labels = window.location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < labels.length - 1; i += 1) domains.push(`; Domain=.${labels.slice(i).join(".")}`);
  for (const name of names) for (const domain of domains) document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
}

const PURCHASES_KEY = "ga-purchases";

/** `purchase` once per booking in this browser, by its hashed transaction id. */
function firstPurchase(transactionId: string): boolean {
  try {
    const seen = JSON.parse(window.localStorage.getItem(PURCHASES_KEY) ?? "[]") as unknown;
    const list = Array.isArray(seen) ? seen.filter((value): value is string => typeof value === "string") : [];
    if (list.includes(transactionId)) return false;
    window.localStorage.setItem(PURCHASES_KEY, JSON.stringify([...list, transactionId].slice(-50)));
    return true;
  } catch {
    // Without storage the page cannot tell; sending twice is worse than not at all.
    return false;
  }
}

function send(event: AnalyticsEvent) {
  const params = scrubParams(event.params);
  if (event.name === "purchase") {
    const id = params.transaction_id;
    if (typeof id !== "string" || !firstPurchase(id)) return;
  }
  gtag("event", event.name, params);
}

/**
 * Sends the queued events of the page just viewed. Events of a page whose `page_view` has not
 * been sent yet wait (after a client-side navigation the page's components mount before the
 * layout sees the new route); the page view drops those of other pages.
 */
function flush() {
  const queue = (window.__ptaAnalytics ?? []) as QueuedEvent[];
  if (state !== "active" || !pageAllowed) {
    window.__ptaAnalytics = [];
    return;
  }
  window.__ptaAnalytics = queue.filter((event) => event.path !== viewedPath);
  for (const event of queue) if (event.path === viewedPath) send(event);
}

/**
 * Brings gtag in line with the current consent choice and page. Called on every consent change
 * and route change. On routes without analytics nothing is loaded or sent.
 */
export function sync(measurementId: string, choice: ConsentChoice, pathname: string, search: string) {
  measurement = measurementId;
  pageAllowed = analyticsAllowed(pathname, search);
  if (state === "idle" && (!choice.analytics || !pageAllowed)) {
    if (!choice.analytics) deleteGaCookies();
    window.__ptaAnalytics = [];
    return;
  }
  window.dataLayer ??= [];
  const plan = consentPlan(state, choice, measurement);
  run(plan.commands);
  if (plan.disable !== undefined) (window as unknown as Record<string, boolean>)[`ga-disable-${measurement}`] = plan.disable;
  if (plan.clearCookies) deleteGaCookies();
  if (plan.loadScript) loadScript(measurement);
  state = plan.next;
  if (!listening) {
    window.addEventListener(ANALYTICS_EVENT, flush);
    listening = true;
  }
  if (state !== "active") {
    viewedPath = null;
    window.__ptaAnalytics = [];
    return;
  }
  // gtag.js stays in memory after a client-side navigation: on a route without analytics (from
  // checkout to the account, say) every hit is switched off, and back on where GA is allowed.
  (window as unknown as Record<string, boolean>)[`ga-disable-${measurement}`] = !pageAllowed;
  if (!pageAllowed) viewedPath = null;
  if (pageAllowed && pathname !== viewedPath) {
    const origin = window.location.origin;
    const referrer = lastLocation ?? pageReferrer(document.referrer, origin);
    run(pageViewCommands({ origin, pathname, title: document.title, referrer }));
    window.__ptaAnalytics = (window.__ptaAnalytics ?? []).filter((event) => event.path === pathname);
    viewedPath = pathname;
    lastLocation = pageLocation(origin, pathname);
  }
  flush();
}
