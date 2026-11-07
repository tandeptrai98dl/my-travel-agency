"use client";

import { type ComponentProps, lazy, Suspense } from "react";

import type { InquirySuccess as Success } from "./inquiry-success";

// Shown only after a send, so it loads on demand: the wizard page stays inside the initial-JS
// budget (Phase 3 spec decision 16). The forms preload it while the request is pending.
const load = () => import("./inquiry-success").then((module) => ({ default: module.InquirySuccess }));
const InquirySuccess = lazy(load);

export function preloadInquirySuccess() {
  void load();
}

export function LazyInquirySuccess(props: ComponentProps<typeof Success>) {
  return (
    <Suspense fallback={null}>
      <InquirySuccess {...props} />
    </Suspense>
  );
}
