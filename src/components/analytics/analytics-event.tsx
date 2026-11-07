"use client";

import { useEffect } from "react";

import { type AnalyticsEvent, track } from "./track";

/** Sends one analytics event when it mounts (a page's `view_item_list`, `view_item`, …). */
export function AnalyticsEvent({ event }: { event: AnalyticsEvent }) {
  useEffect(() => {
    track(event);
    // Once per page view: the payload is built on the server and does not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
