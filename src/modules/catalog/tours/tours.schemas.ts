import { z } from "zod";

import { isValidSlug } from "@/lib/slug";

/**
 * Admin input for tours (docs/specs/phase-2-catalog-admin.md steps 12–13, decisions 1 and 3).
 * Messages are keys in `Admin.Tours.errors` (shared keys fall back to `Admin.Taxonomy.errors`).
 * The database repeats the important rules (supabase/migrations/*_tour_rules.sql).
 */
export const TOUR_LOCALES = ["vi", "en"] as const;
export type TourLocale = (typeof TOUR_LOCALES)[number];
export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export const TOUR_CODE = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
export const TOURS_PAGE_SIZE = 25;
export const TOUR_SORTS = ["code", "updated_at", "duration_days"] as const;

const text = (max: number) => z.string().trim().max(max, "tooLong");
/** Empty text is stored as null; accepts null, so parsed values parse again unchanged. */
const optionalText = (max: number) =>
  text(max)
    .nullish()
    .transform((value) => (value ? value : null));
const lines = (maxItems: number, maxLength: number) =>
  z
    .array(text(maxLength))
    .max(maxItems, "tooMany")
    .transform((items) => items.filter((item) => item !== ""));
const count = (min: number, max: number) => z.number("wholeNumber").int("wholeNumber").min(min, "outOfRange").max(max, "outOfRange");
const optionalCount = (min: number, max: number) =>
  z
    .union([count(min, max), z.null()])
    .optional()
    .transform((value) => value ?? null);

export const itineraryDaySchema = z.object({
  title: text(160).min(1, "required"),
  description: text(2000),
  meals: z.array(z.enum(MEALS)).max(3),
  accommodation: optionalText(160),
  /** One photo for the day on the public page (Phase 3 spec decision 17); stored in `media_ids`. */
  mediaId: z.uuid().nullish().transform((value) => value ?? null),
});

export const faqSchema = z.object({
  question: text(300).min(1, "required"),
  answer: text(2000).min(1, "required"),
});

export const tourTranslationSchema = z
  .object({
    slug: z.string().trim().max(80, "tooLong"),
    title: text(160),
    subtitle: optionalText(200),
    summary: text(600),
    highlights: lines(12, 200),
    itinerary: z.array(itineraryDaySchema).max(60, "tooMany"),
    inclusions: lines(30, 300),
    exclusions: lines(30, 300),
    practicalInfo: optionalText(4000),
    faqs: z.array(faqSchema).max(20, "tooMany"),
    seoTitle: optionalText(120),
    seoDescription: optionalText(300),
    ogMediaId: z.uuid().nullable(),
    isPublished: z.boolean(),
  })
  .superRefine((value, ctx) => {
    // A language left without a title is not saved; once it has one it needs a slug and summary.
    if (!value.title) {
      if (value.isPublished) ctx.addIssue({ code: "custom", path: ["title"], message: "requiredToPublish" });
      return;
    }
    if (!isValidSlug(value.slug)) {
      ctx.addIssue({ code: "custom", path: ["slug"], message: value.slug ? "slugInvalid" : "required" });
    }
    if (!value.summary) ctx.addIssue({ code: "custom", path: ["summary"], message: "required" });
    // Decision 3: publishing a tour translation also needs its SEO description.
    if (value.isPublished && !value.seoDescription) {
      ctx.addIssue({ code: "custom", path: ["seoDescription"], message: "requiredToPublish" });
    }
  });

/** Admin-only columns (ADR-024); other roles never send them. */
export const tourPricesSchema = z.object({
  fromPrice: z.number("wholeNumber").int("wholeNumber").min(0, "outOfRange").max(10_000_000_000, "outOfRange"),
  depositPercent: count(0, 100),
  balanceDueDays: count(0, 365),
  cancellationPolicyId: z.uuid().nullable(),
});

export const tourSchema = z
  .object({
    id: z.uuid().optional(),
    code: z.string().trim().min(2, "required").max(20, "tooLong").regex(TOUR_CODE, "codeInvalid"),
    type: z.enum(["group", "private"]),
    scope: z.enum(["domestic", "international"]),
    status: z.enum(["draft", "published", "archived"]),
    durationDays: count(1, 60),
    durationNights: count(0, 60),
    minPax: count(1, 100),
    maxPax: optionalCount(1, 200),
    minPaxToOperate: optionalCount(1, 200),
    childAgeMax: count(0, 17),
    infantAgeMax: count(0, 5),
    isFeatured: z.boolean(),
    heroMediaId: z.uuid().nullable(),
    galleryIds: z.array(z.uuid()).max(40, "tooMany"),
    destinationIds: z.array(z.uuid()).max(30, "tooMany"),
    travelStyleIds: z.array(z.uuid()).max(10, "tooMany"),
    prices: tourPricesSchema.nullable(),
    translations: z.object({ vi: tourTranslationSchema, en: tourTranslationSchema }),
  })
  .superRefine((value, ctx) => {
    if (value.durationNights > value.durationDays) {
      ctx.addIssue({ code: "custom", path: ["durationNights"], message: "nightsAfterDays" });
    }
    if (value.maxPax !== null && value.maxPax < value.minPax) {
      ctx.addIssue({ code: "custom", path: ["maxPax"], message: "maxBelowMin" });
    }
    if (value.infantAgeMax >= value.childAgeMax) {
      ctx.addIssue({ code: "custom", path: ["infantAgeMax"], message: "infantAge" });
    }
    if (!value.translations.vi.title) {
      ctx.addIssue({ code: "custom", path: ["translations", "vi", "title"], message: "required" });
    }
    // Decision 3; the price part (a departure or from_price) is checked by the service and the
    // database, which see the stored departures and prices.
    if (value.status === "published") {
      if (!value.translations.vi.isPublished && !value.translations.en.isPublished) {
        ctx.addIssue({ code: "custom", path: ["status"], message: "publishNeedsTranslation" });
      }
      if (!value.heroMediaId) ctx.addIssue({ code: "custom", path: ["heroMediaId"], message: "publishNeedsHero" });
    }
  });
export type TourInput = z.input<typeof tourSchema>;
export type TourValues = z.output<typeof tourSchema>;

/** The short form that creates a draft; the editor fills in the rest. */
export const newTourSchema = z.object({
  code: tourSchema.shape.code,
  type: z.enum(["group", "private"]),
  scope: z.enum(["domestic", "international"]),
  durationDays: count(1, 60),
  durationNights: count(0, 60),
  title: text(160).min(1, "required"),
});
export type NewTourInput = z.input<typeof newTourSchema>;

export const tourIdSchema = z.object({ id: z.uuid() });

export const duplicateTourSchema = z.object({
  id: z.uuid(),
  code: tourSchema.shape.code,
});

export const tourSlugCheckSchema = z.object({
  locale: z.enum(TOUR_LOCALES),
  slug: z.string().trim().max(80),
  excludeId: z.uuid().optional(),
});

export const tourListFilters = {
  status: ["draft", "published", "archived"],
  type: ["group", "private"],
  scope: ["domestic", "international"],
} as const;
