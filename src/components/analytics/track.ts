/**
 * The page side of analytics events (ADR-039). Components call `track()`; the gtag loader, which is
 * imported only after the visitor grants "analytics", drains the queue. Without consent or a
 * measurement ID nothing is kept for long and nothing is sent. This file has no imports so it adds
 * almost nothing to the initial JavaScript of public pages.
 */

export type AnalyticsEventName = "view_item_list" | "view_item" | "begin_checkout" | "purchase" | "generate_lead";
export type AnalyticsParams = Record<string, string | number | boolean | AnalyticsItem[]>;
export type AnalyticsItem = Record<string, string | number>;
export type AnalyticsEvent = { name: AnalyticsEventName; params: AnalyticsParams };

export type QueuedEvent = AnalyticsEvent & { path: string };

declare global {
  interface Window {
    __ptaAnalytics?: QueuedEvent[];
  }
}

/** Fired after an event is queued, so a loaded gtag loader sends it at once. */
export const ANALYTICS_EVENT = "pta:analytics";
const MAX_QUEUE = 20;

/** Queues an event for the current page (dropped unless analytics is configured and granted). */
export function track(event: AnalyticsEvent): void {
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) return;
  const queue = (window.__ptaAnalytics ??= []);
  queue.push({ ...event, path: window.location.pathname });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  window.dispatchEvent(new Event(ANALYTICS_EVENT));
}
