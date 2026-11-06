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
  /** Journal list and article pages (Phase 3 PR K): the homepage journal teaser waits for them. */
  journal: false,
  /** Contact page (Phase 3 PR K): until then contact calls to action use the hotline and email. */
  contactPage: false,
} as const;
