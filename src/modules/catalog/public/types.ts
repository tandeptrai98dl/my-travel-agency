import type { IsoDate } from "@/lib/dates";
import type { ImageData } from "@/lib/images";

export type Locale = "vi" | "en";

/** One tour as cards show it (docs/specs/tour-listing.md §4.4). */
export type TourCardItem = {
  id: string;
  /** The tour's public code (analytics item id, ADR-039). */
  code: string;
  slug: string;
  title: string;
  type: "group" | "private";
  durationDays: number;
  durationNights: number;
  displayPrice: number;
  priceSource: "departure" | "from_price";
  nextDepartureDate: IsoDate | null;
  otherDepartureCount: number;
  seatsLeftNext: number | null;
  destinations: { key: string; name: string }[];
  image: ImageData | null;
};

/** Per-language paths of a page for hreflang and the language switcher (decisions 5 and 6). */
export type LocaleLinks = Record<Locale, { href: string; available: boolean }>;
