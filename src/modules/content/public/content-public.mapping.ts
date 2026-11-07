import { type IsoDate, todayInVietnam } from "@/lib/dates";
import type { ImageData } from "@/lib/images";
import { type RichTextDoc, sanitizeRichText } from "@/lib/rich-text";
import { toImage, type MediaRow } from "@/modules/catalog/public/tour-public.mapping";
import type { Locale } from "@/modules/catalog/public/types";

/** Pure mapping for the public journal, pages and reviews (unit-tested; no I/O). */

export type JournalCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: IsoDate | null;
  image: ImageData | null;
  topic: { slug: string; name: string } | null;
};

export type TopicRow = { id: string; sort_order: number; post_category_translations: { locale: string; slug: string; name: string }[] };
export type Topic = { id: string; slug: string; name: string; count: number };

const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

export function vietnamDate(timestamp: string | null | undefined): IsoDate | null {
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return null;
  return todayInVietnam(new Date(timestamp));
}

/** Topics translated into this language that hold at least one published article in it. */
export function toTopics(rows: TopicRow[], postCategories: (string | null)[], locale: Locale): Topic[] {
  const counts = new Map<string, number>();
  for (const id of postCategories) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((row) => {
      const translation = row.post_category_translations.find((item) => item.locale === locale);
      const count = counts.get(row.id) ?? 0;
      return translation && count > 0 ? [{ id: row.id, slug: translation.slug, name: translation.name, count }] : [];
    });
}

type PostRow = {
  id: string;
  published_at: string | null;
  category_id: string | null;
  cover: MediaRow | null;
  post_translations: { slug: string; title: string; excerpt: string | null; locale: string }[];
};

export function toJournalCards(rows: PostRow[], topics: Topic[], locale: Locale): JournalCard[] {
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  return rows.flatMap((row) => {
    const translation = row.post_translations.find((item) => item.locale === locale);
    if (!translation) return [];
    const topic = row.category_id ? byId.get(row.category_id) : undefined;
    return [
      {
        id: row.id,
        slug: translation.slug,
        title: translation.title,
        excerpt: text(translation.excerpt),
        publishedAt: vietnamDate(row.published_at),
        image: toImage(row.cover, locale),
        topic: topic ? { slug: topic.slug, name: topic.name } : null,
      },
    ];
  });
}

export type FaqItem = { question: string; answer: string };

/**
 * Question and answer pairs of an FAQ page for `FAQPage` structured data: each heading is a
 * question when it ends in "?" and the paragraphs and lists until the next heading are its answer
 * (plain text); other headings are section titles and are left out.
 */
export function faqFromRichText(content: unknown): FaqItem[] {
  const doc: RichTextDoc = sanitizeRichText(content);
  // Text runs inside a paragraph or heading join as they are; blocks (list items) join with a space.
  const plain = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const value = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof value.text === "string") return value.text;
    const inline = value.type === "paragraph" || value.type === "heading";
    return (value.content ?? []).map(plain).join(inline ? "" : " ");
  };
  const items: FaqItem[] = [];
  let current: FaqItem | null = null;
  for (const block of doc.content) {
    if (block.type === "heading") {
      if (current?.answer) items.push(current);
      // Only a heading that asks something is a question; other headings (section titles such as
      // "Đặt chỗ") end the current answer and start nothing, so their text is not marked up.
      const heading = plain(block).replace(/\s+/g, " ").trim();
      current = /[?？]$/.test(heading) ? { question: heading, answer: "" } : null;
    } else if (current && block.type !== "image") {
      const part = plain(block).replace(/\s+/g, " ").trim();
      if (part) current.answer = current.answer ? `${current.answer} ${part}` : part;
    }
  }
  if (current?.answer) items.push(current);
  return items.filter((item) => item.question && item.answer);
}

export type ReviewRow = {
  id: string;
  author_name: string;
  author_country: string | null;
  rating: number;
  title: string | null;
  content: string;
  locale: Locale;
  travel_date: string | null;
  is_verified: boolean;
  tours: { id: string; tour_translations: { locale: string; slug: string; title: string }[] } | null;
};

export type PublicReview = {
  id: string;
  authorName: string;
  authorCountry: string | null;
  rating: number;
  title: string | null;
  content: string;
  locale: Locale;
  travelDate: IsoDate | null;
  verified: boolean;
  tour: { slug: string; title: string } | null;
};

export function toPublicReviews(rows: ReviewRow[], locale: Locale): PublicReview[] {
  return rows.map((row) => {
    const translation = row.tours?.tour_translations.find((item) => item.locale === locale);
    return {
      id: row.id,
      authorName: row.author_name.trim(),
      authorCountry: text(row.author_country),
      rating: Math.min(5, Math.max(1, Math.round(row.rating))),
      title: text(row.title),
      content: row.content.trim(),
      locale: row.locale,
      travelDate: row.travel_date,
      verified: row.is_verified,
      tour: translation ? { slug: translation.slug, title: translation.title } : null,
    };
  });
}

export function ratingSummary(ratings: number[]): { count: number; average: number | null } {
  if (ratings.length === 0) return { count: 0, average: null };
  return { count: ratings.length, average: Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10 };
}
