import type { AnalyticsEvent, AnalyticsItem } from "./track";

/**
 * The five GA4 events (ARCHITECTURE.md "SEO", ADR-039). Each carries catalog facts only: a tour's
 * public code and title, prices in VND, a list name. Never a person's name, email or phone, a
 * booking or inquiry code, or the consent id; `purchase` identifies the booking by a salted hash
 * made on the server. `scrubParams()` in the loader drops anything that slips through anyway.
 */

export type TourItem = { code: string; title: string; price?: number | null };

function item(tour: TourItem, index?: number): AnalyticsItem {
  return {
    item_id: tour.code,
    item_name: tour.title,
    ...(tour.price && tour.price > 0 ? { price: Math.round(tour.price) } : {}),
    ...(index !== undefined ? { index } : {}),
  };
}

/** The tour listing (or another list of tours) as shown. */
export function viewItemList(listId: string, tours: TourItem[]): AnalyticsEvent {
  return {
    name: "view_item_list",
    params: { item_list_id: listId, item_list_name: listId, items: tours.slice(0, 50).map((tour, index) => item(tour, index)) },
  };
}

/** A tour page. */
export function viewItem(tour: TourItem): AnalyticsEvent {
  const price = tour.price && tour.price > 0 ? Math.round(tour.price) : 0;
  return { name: "view_item", params: { currency: "VND", value: price, items: [item(tour)] } };
}

/** The booking form of a tour. */
export function beginCheckout(tour: TourItem): AnalyticsEvent {
  const price = tour.price && tour.price > 0 ? Math.round(tour.price) : 0;
  return { name: "begin_checkout", params: { currency: "VND", value: price, items: [item(tour)] } };
}

/** A confirmed booking, once (the loader deduplicates by `transaction_id`). */
export function purchase(input: { transactionId: string; value: number; tour?: TourItem }): AnalyticsEvent {
  return {
    name: "purchase",
    params: {
      transaction_id: input.transactionId,
      currency: "VND",
      value: Math.round(input.value),
      ...(input.tour ? { items: [item(input.tour)] } : {}),
    },
  };
}

export type LeadSource = "tailor_made" | "tour_inquiry" | "contact";

/** An inquiry that was received (the wizard, a private tour's form or the contact form). */
export function generateLead(source: LeadSource): AnalyticsEvent {
  return { name: "generate_lead", params: { lead_source: source } };
}
