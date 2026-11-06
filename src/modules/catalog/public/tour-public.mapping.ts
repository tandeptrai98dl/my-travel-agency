import type { IsoDate } from "@/lib/dates";
import { mediaUrl, type ImageData } from "@/lib/images";

import type { Locale, TourCardItem } from "./types";

/** Pure mapping from public rows to page data (unit-tested; no I/O). */

export type MediaRow = {
  id: string;
  path: string;
  width: number | null;
  height: number | null;
  alt: unknown;
  blur_data_url: string | null;
};

/** Fallback size for rows without dimensions (seed rows): the 3:2 the editors are asked for. */
const DEFAULT_SIZE = { width: 2400, height: 1600 };

export function toImage(row: MediaRow | null | undefined, locale: Locale): ImageData | null {
  if (!row) return null;
  const alt = (row.alt ?? {}) as Partial<Record<Locale, unknown>>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return {
    src: mediaUrl(row.path),
    width: row.width ?? DEFAULT_SIZE.width,
    height: row.height ?? DEFAULT_SIZE.height,
    // Published content has both alt texts (ADR-024); the other language is only a safety net.
    alt: text(alt[locale]) || text(alt.vi) || text(alt.en),
    blurDataUrl: row.blur_data_url && row.blur_data_url.startsWith("data:image/") ? row.blur_data_url : null,
  };
}

export function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}

export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export type Meal = (typeof MEALS)[number];

export type ItineraryDay = {
  day: number;
  title: string;
  description: string;
  meals: Meal[];
  accommodation: string | null;
  mediaId: string | null;
};

export function readItinerary(value: unknown): ItineraryDay[] {
  if (!Array.isArray(value)) return [];
  const days = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const day = item as Record<string, unknown>;
    const title = typeof day.title === "string" ? day.title.trim() : "";
    if (!title) return [];
    const meals = Array.isArray(day.meals)
      ? MEALS.filter((meal) => (day.meals as unknown[]).includes(meal))
      : [];
    const mediaIds = Array.isArray(day.media_ids) ? day.media_ids.filter((id): id is string => typeof id === "string") : [];
    return [
      {
        day: 0,
        title,
        description: typeof day.description === "string" ? day.description.trim() : "",
        meals,
        accommodation: typeof day.accommodation === "string" && day.accommodation.trim() ? day.accommodation.trim() : null,
        mediaId: mediaIds[0] ?? null,
      },
    ];
  });
  // Days are numbered by position among the readable ones.
  return days.map((day, index) => ({ ...day, day: index + 1 }));
}

export type Faq = { question: string; answer: string };

export function readFaqs(value: unknown): Faq[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { question, answer } = item as Record<string, unknown>;
    return typeof question === "string" && typeof answer === "string" && question.trim() && answer.trim()
      ? [{ question: question.trim(), answer: answer.trim() }]
      : [];
  });
}

export type PolicyRule = { minDaysBefore: number; refundPercent: number };
export type Policy = { summary: string | null; rules: PolicyRule[] };

export function readPolicy(row: { summary: unknown; rules: unknown } | null | undefined, locale: Locale): Policy | null {
  if (!row) return null;
  const summary = (row.summary ?? {}) as Partial<Record<Locale, unknown>>;
  const rules = Array.isArray(row.rules)
    ? row.rules.flatMap((rule) => {
        if (!rule || typeof rule !== "object") return [];
        const { min_days_before: days, refund_percent: percent } = rule as Record<string, unknown>;
        return typeof days === "number" && typeof percent === "number" ? [{ minDaysBefore: days, refundPercent: percent }] : [];
      })
    : [];
  const text = typeof summary[locale] === "string" ? (summary[locale] as string).trim() : "";
  return { summary: text || null, rules };
}

export type PriceTier = { minPax: number; maxPax: number; pricePerAdult: number };

/** Indicative private-tour tiers valid today (or with no validity window), by group size. */
export function readPriceTiers(
  rows: { min_pax: number; max_pax: number; price_per_adult: number; valid_from: string | null; valid_to: string | null }[],
  today: IsoDate,
): PriceTier[] {
  return rows
    .filter((row) => (!row.valid_from || row.valid_from <= today) && (!row.valid_to || row.valid_to >= today))
    .map((row) => ({ minPax: row.min_pax, maxPax: row.max_pax, pricePerAdult: row.price_per_adult }))
    .sort((a, b) => a.minPax - b.minPax);
}

export type SearchRow = {
  tour_id: string;
  display_price: number;
  price_source: string;
  next_departure_date: string | null;
  other_departure_count: number;
  seats_left_next: number | null;
};

export type CardRow = {
  id: string;
  type: "group" | "private";
  duration_days: number;
  duration_nights: number;
  hero: MediaRow | null;
  tour_translations: { slug: string; title: string }[];
  tour_destinations: { destination_id: string }[];
};

/** Cards in the order `search_tours` returned them; tours missing from `rows` are dropped. */
export function buildCards(
  searchRows: SearchRow[],
  rows: CardRow[],
  destinationName: (id: string) => { key: string; name: string } | null,
  locale: Locale,
): TourCardItem[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return searchRows.flatMap((hit) => {
    const row = byId.get(hit.tour_id);
    const translation = row?.tour_translations[0];
    if (!row || !translation) return [];
    return [
      {
        id: row.id,
        slug: translation.slug,
        title: translation.title,
        type: row.type,
        durationDays: row.duration_days,
        durationNights: row.duration_nights,
        displayPrice: hit.display_price,
        priceSource: hit.price_source === "departure" ? "departure" : "from_price",
        nextDepartureDate: hit.next_departure_date,
        otherDepartureCount: hit.other_departure_count,
        seatsLeftNext: hit.seats_left_next,
        destinations: row.tour_destinations.flatMap((link) => {
          const destination = destinationName(link.destination_id);
          return destination ? [destination] : [];
        }),
        image: toImage(row.hero, locale),
      },
    ];
  });
}

export type DestinationRef = { id: string; key: string; parent_id: string | null };

/** The ids of `roots` and every destination below them. */
export function withDescendants(roots: string[], all: DestinationRef[]): string[] {
  const children = new Map<string, string[]>();
  for (const row of all) {
    if (!row.parent_id) continue;
    children.set(row.parent_id, [...(children.get(row.parent_id) ?? []), row.id]);
  }
  const out = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return [...out];
}

/** The top-level ancestor (country) of each destination id. */
export function countryOf(id: string, all: DestinationRef[]): string {
  const byId = new Map(all.map((row) => [row.id, row]));
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current?.parent_id && byId.has(current.parent_id) && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.parent_id);
  }
  return current?.id ?? id;
}
