"use client";

import { type ComponentProps, lazy, Suspense } from "react";

import type { TourInquiryForm as Form } from "./tour-inquiry-form";

// Its own chunk, loaded only on private tours' pages: every tour page shares one route bundle, and
// the group tours' pages must stay inside the initial-JS budget (Phase 3 spec decision 16).
const TourInquiryForm = lazy(() => import("./tour-inquiry-form").then((module) => ({ default: module.TourInquiryForm })));

export function LazyTourInquiryForm(props: ComponentProps<typeof Form>) {
  return (
    <Suspense fallback={null}>
      <TourInquiryForm {...props} />
    </Suspense>
  );
}
