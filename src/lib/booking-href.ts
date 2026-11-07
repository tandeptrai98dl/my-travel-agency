import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/**
 * The tour page's way into the book-now flow (docs/specs/phase-4-booking-payments.md decision
 * 13): `/dat-tour/<slug>?departure=<id>&adults=<n>&children=<n>` (`/en/book/…`). The booking page
 * validates every parameter and falls back to the first bookable departure.
 */
export function bookingHref(
  locale: Locale,
  tourSlug: string,
  choice: { departureId?: string | null; adults?: number; children?: number } = {},
): string {
  const path = getPathname({ locale, href: { pathname: "/book/[tourSlug]", params: { tourSlug } } });
  const query = new URLSearchParams();
  if (choice.departureId) query.set("departure", choice.departureId);
  if (choice.adults) query.set("adults", String(choice.adults));
  if (choice.children) query.set("children", String(choice.children));
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}
