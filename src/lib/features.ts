/**
 * Customer flows that are not built yet (Phase 3 spec decision 9). Calls to action that need them
 * point to the contact page until the phase that ships the flow switches its flag on, so no link
 * ever leads to a route that does not exist.
 */
export const features = {
  /** Online booking and payment (Phase 4): group tours' booking box opens the book-now flow. */
  booking: true,
  /** Guest booking lookup by code and email (Phase 5): the footer links it. */
  bookingLookup: false,
  /** Tailor-made wizard and private-tour inquiry form (Phase 5 PR 5W). */
  inquiry: true,
  /** Journal list and article pages (Phase 3 PR K): the homepage journal teaser shows. */
  journal: true,
  /** Contact page (Phase 3 PR K): contact calls to action open it (hotline and email before). */
  contactPage: true,
} as const;
