import { todayInVietnam, type IsoDate } from "@/lib/dates";
import type { ImageData } from "@/lib/images";
import { toImage, type MediaRow } from "@/modules/catalog/public/tour-public.mapping";
import type { Locale } from "@/modules/catalog/public/types";

import type { HomepageSetting } from "./homepage.schemas";

/** Pure mapping of the homepage rows (unit-tested; no I/O). */

export type HomeDestination = { key: string; slug: string; name: string; summary: string | null; bestTime: string | null; image: ImageData | null };
export type HomeTravelStyle = { key: string; slug: string; name: string; description: string | null; image: ImageData | null };
export type HomeTestimonial = {
  id: string;
  authorName: string;
  authorCountry: string | null;
  rating: number;
  title: string | null;
  content: string;
  locale: Locale;
  verified: boolean;
};
export type HomePost = { slug: string; title: string; excerpt: string | null; publishedAt: IsoDate | null; image: ImageData | null };
export type HomeHero = { eyebrow: string | null; title: string | null; image: ImageData | null };

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * An image only when its alt text exists in this language. The hero and the homepage cards never
 * show a photo without alt text (the database guard for `homepage.hero.media_id` arrives with
 * Stream A's settings PR): a missing row, path or alt gives `null`, so the section falls back to
 * the navy band or a neutral frame.
 */
export function imageWithAlt(row: MediaRow | null | undefined, locale: Locale): ImageData | null {
  if (!row || !text(row.path)) return null;
  const alt = text((row.alt as Partial<Record<Locale, unknown>> | null)?.[locale]);
  if (!alt) return null;
  const image = toImage(row, locale);
  return image ? { ...image, alt } : null;
}

export function toHero(setting: HomepageSetting, locale: Locale, media: MediaRow | null): HomeHero {
  const hero = setting.hero;
  return {
    eyebrow: text(hero?.eyebrow?.[locale]),
    title: text(hero?.title?.[locale]),
    image: hero?.media_id && media?.id === hero.media_id ? imageWithAlt(media, locale) : null,
  };
}

type TranslationRow = Record<string, unknown> & { locale?: string };
type DestinationRow = { key: string; hero: MediaRow | null; destination_translations: TranslationRow[] };
type StyleRow = { key: string; hero: MediaRow | null; travel_style_translations: TranslationRow[] };

function translationOf(rows: TranslationRow[] | null | undefined, locale: Locale): TranslationRow | null {
  return rows?.find((row) => row.locale === locale) ?? null;
}

/** Published destinations in the order the `homepage` setting lists their keys. */
export function toDestinations(keys: string[], rows: DestinationRow[], locale: Locale): HomeDestination[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return keys.flatMap((key) => {
    const row = byKey.get(key);
    const translation = translationOf(row?.destination_translations, locale);
    const name = text(translation?.name);
    const slug = text(translation?.slug);
    if (!row || !name || !slug) return [];
    return [
      {
        key,
        slug,
        name,
        summary: text(translation?.summary),
        bestTime: text(translation?.best_time_to_visit),
        image: imageWithAlt(row.hero, locale),
      },
    ];
  });
}

export function toTravelStyles(rows: StyleRow[], locale: Locale): HomeTravelStyle[] {
  return rows.flatMap((row) => {
    const translation = translationOf(row.travel_style_translations, locale);
    const name = text(translation?.name);
    const slug = text(translation?.slug);
    if (!name || !slug) return [];
    return [{ key: row.key, slug, name, description: text(translation?.description), image: imageWithAlt(row.hero, locale) }];
  });
}

type ReviewRow = {
  id: string;
  author_name: string;
  author_country: string | null;
  rating: number;
  title: string | null;
  content: string;
  locale: Locale;
  is_verified: boolean;
};

/** One featured review, preferring one written in this language (decision 19); null when none. */
export function pickTestimonial(rows: ReviewRow[], locale: Locale): HomeTestimonial | null {
  const usable = rows.filter((row) => text(row.content) && text(row.author_name));
  const row = usable.find((review) => review.locale === locale) ?? usable[0];
  if (!row) return null;
  return {
    id: row.id,
    authorName: row.author_name.trim(),
    authorCountry: text(row.author_country),
    rating: Math.min(5, Math.max(1, Math.round(row.rating))),
    title: text(row.title),
    content: row.content.trim(),
    locale: row.locale,
    verified: row.is_verified,
  };
}

type PostRow = { published_at: string | null; cover: MediaRow | null; post_translations: TranslationRow[] };

export function toPosts(rows: PostRow[], locale: Locale): HomePost[] {
  return rows.flatMap((row) => {
    const translation = translationOf(row.post_translations, locale);
    const slug = text(translation?.slug);
    const title = text(translation?.title);
    if (!slug || !title) return [];
    return [
      {
        slug,
        title,
        excerpt: text(translation?.excerpt),
        publishedAt: row.published_at && !Number.isNaN(Date.parse(row.published_at)) ? todayInVietnam(new Date(row.published_at)) : null,
        image: imageWithAlt(row.cover, locale),
      },
    ];
  });
}
