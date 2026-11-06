import { z } from "zod";

import { isValidSlug } from "@/lib/slug";

/**
 * Admin input for destinations, travel styles and cancellation policies
 * (docs/specs/phase-2-catalog-admin.md steps 8–10). Messages are keys in `Admin.Taxonomy.errors`.
 * The database repeats the important rules (supabase/migrations/*_taxonomy_rules.sql).
 */
export const LOCALES = ["vi", "en"] as const;
export type ContentLocale = (typeof LOCALES)[number];

const text = (max: number) => z.string().trim().max(max, "tooLong");
/** Empty text is stored as null; accepts null too, so parsed values parse again unchanged. */
const optionalText = (max: number) =>
  text(max)
    .nullish()
    .transform((value) => (value ? value : null));
const key = z
  .string()
  .trim()
  .min(2, "required")
  .max(60, "tooLong")
  .refine(isValidSlug, "keyInvalid");

/**
 * One language. A language left without a name is not saved (no translation row); once it has a
 * name it needs a slug, and publishing also needs the body text (decision 3).
 */
function checkTranslation(
  value: { slug: string; name: string; isPublished: boolean },
  body: { field: string; value: string | null },
  ctx: z.RefinementCtx,
) {
  if (!value.name) {
    if (value.isPublished) ctx.addIssue({ code: "custom", path: ["name"], message: "requiredToPublish" });
    return;
  }
  if (!isValidSlug(value.slug)) {
    ctx.addIssue({ code: "custom", path: ["slug"], message: value.slug ? "slugInvalid" : "required" });
  }
  if (value.isPublished && !body.value) {
    ctx.addIssue({ code: "custom", path: [body.field], message: "requiredToPublish" });
  }
}

const translationBase = {
  slug: z.string().trim().max(80, "tooLong"),
  name: text(120),
  seoTitle: optionalText(120),
  seoDescription: optionalText(300),
  isPublished: z.boolean(),
};

export const destinationTranslationSchema = z
  .object({ ...translationBase, summary: optionalText(400), bestTimeToVisit: optionalText(200) })
  .superRefine((value, ctx) => checkTranslation(value, { field: "summary", value: value.summary }, ctx));

export const travelStyleTranslationSchema = z
  .object({ ...translationBase, description: optionalText(600) })
  .superRefine((value, ctx) => checkTranslation(value, { field: "description", value: value.description }, ctx));

function requireVietnamese(value: { vi: { name: string } }, ctx: z.RefinementCtx) {
  if (!value.vi.name) ctx.addIssue({ code: "custom", path: ["vi", "name"], message: "required" });
}

const coordinate = (min: number, max: number) =>
  z
    .union([z.number().min(min, "outOfRange").max(max, "outOfRange"), z.null()])
    .optional()
    .transform((value) => value ?? null);

export const destinationSchema = z.object({
  id: z.uuid().optional(),
  key,
  type: z.enum(["country", "region", "city"]),
  parentId: z.uuid().nullable(),
  status: z.enum(["draft", "published", "archived"]),
  heroMediaId: z.uuid().nullable(),
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
  sortOrder: z.number().int().min(0).max(10_000),
  translations: z
    .object({ vi: destinationTranslationSchema, en: destinationTranslationSchema })
    .superRefine(requireVietnamese),
});
export type DestinationInput = z.input<typeof destinationSchema>;
export type DestinationValues = z.output<typeof destinationSchema>;

export const travelStyleSchema = z.object({
  id: z.uuid().optional(),
  key,
  status: z.enum(["draft", "published", "archived"]),
  heroMediaId: z.uuid().nullable(),
  sortOrder: z.number().int().min(0).max(10_000),
  translations: z
    .object({ vi: travelStyleTranslationSchema, en: travelStyleTranslationSchema })
    .superRefine(requireVietnamese),
});
export type TravelStyleInput = z.input<typeof travelStyleSchema>;
export type TravelStyleValues = z.output<typeof travelStyleSchema>;

/** Same rules as `public.is_valid_cancellation_rules()`. */
export const cancellationRulesSchema = z
  .array(
    z.object({
      minDaysBefore: z.number().int("wholeNumber").min(0, "outOfRange").max(365, "outOfRange"),
      refundPercent: z.number().int("wholeNumber").min(0, "outOfRange").max(100, "outOfRange"),
    }),
  )
  .min(1, "required")
  .max(10, "tooMany")
  .superRefine((rules, ctx) => {
    rules.forEach((rule, index) => {
      const previous = rules[index - 1];
      if (previous && rule.minDaysBefore >= previous.minDaysBefore) {
        ctx.addIssue({ code: "custom", path: [index, "minDaysBefore"], message: "daysOrder" });
      }
      if (previous && rule.refundPercent > previous.refundPercent) {
        ctx.addIssue({ code: "custom", path: [index, "refundPercent"], message: "refundOrder" });
      }
    });
    if (rules.length > 0 && rules[rules.length - 1].minDaysBefore !== 0) {
      ctx.addIssue({ code: "custom", path: [rules.length - 1, "minDaysBefore"], message: "lastRuleDayZero" });
    }
  });

export const cancellationPolicySchema = z.object({
  id: z.uuid().optional(),
  name: text(120).min(1, "required"),
  rules: cancellationRulesSchema,
  summary: z.object({ vi: text(600).min(1, "required"), en: text(600).min(1, "required") }),
  isDefault: z.boolean(),
});
export type CancellationPolicyInput = z.input<typeof cancellationPolicySchema>;
export type CancellationPolicyValues = z.output<typeof cancellationPolicySchema>;

export const idSchema = z.object({ id: z.uuid() });

export const slugCheckSchema = z.object({
  kind: z.enum(["destination", "travelStyle"]),
  locale: z.enum(LOCALES),
  slug: z.string().trim().max(80),
  excludeId: z.uuid().optional(),
});

/** Which languages have a translation to save (the empty-translation union member is skipped). */
export function filledLocales<T extends { name?: string }>(value: Record<ContentLocale, T>): ContentLocale[] {
  return LOCALES.filter((locale) => Boolean(value[locale].name));
}
