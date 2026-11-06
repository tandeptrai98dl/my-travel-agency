/**
 * Customer flows that are not built yet (Phase 3 spec decision 9). Calls to action that need them
 * point to the contact page until the phase that ships the flow switches its flag on, so no link
 * ever leads to a route that does not exist.
 */
export const features = {
  /** Online booking and payment (Phase 4). */
  booking: false,
  /** Tailor-made wizard and tour inquiries (Phase 5). */
  inquiry: false,
  /** Double opt-in newsletter sign-up (Phase 5). */
  newsletter: false,
} as const;
