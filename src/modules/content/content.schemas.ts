import { z } from "zod";

import { RICH_TEXT_MAX_BYTES, richTextIsEmpty, sanitizeRichText } from "@/lib/rich-text";
import { isValidSlug } from "@/lib/slug";

/**
 * Admin input for the journal (posts and categories) and static pages
 * (docs/specs/phase-2-catalog-admin.md step 18, decisions 3 and 7). Messages are keys in
 * `Admin.Content.errors` (shared keys fall back to `Admin.Taxonomy.errors`). The database repeats
 * the important rules (supabase/migrations/*_content_rules.sql).
 */
export const CONTENT_LOCALES = ["vi", "en"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/** Fixed static pages (DATABASE.md `pages.key`); policies are served at /policies/[slug]. */
export const PAGE_KEYS = ["about", "terms", "privacy", "cancellation", "payment", "faq"] as const;
export type PageKey = (typeof PAGE_KEYS)[number];
export const POLICY_PAGE_KEYS = ["terms", "privacy", "cancellation", "payment"] as const satisfies readonly PageKey[];

export const POSTS_PAGE_SIZE = 25;
export const POST_SORTS = ["updated_at", "published_at", "created_at"] as const;
export const postListFilters = { status: ["draft", "published", "archived"], category: null } as const;

const text = (max: number) => z.string().trim().max(max, "tooLong");
/** Empty text is stored as null; accepts null, so parsed values parse again unchanged. */
const optionalText = (max: number) =>
  text(max)
    .nullish()
    .transform((value) => (value ? value : null));

/** Tiptap JSON: sanitized here (decision 7), so only whitelisted nodes are ever stored. */
export const richTextSchema = z
  .unknown()
  .refine((value) => JSON.stringify(value ?? null).length <= RICH_TEXT_MAX_BYTES, "tooLong")
  .transform((value) => sanitizeRichText(value));

const translationFields = {
  slug: z.string().trim().max(80, "tooLong"),
  title: text(160),
  content: richTextSchema,
  seoTitle: optionalText(120),
  seoDescription: optionalText(300),
  isPublished: z.boolean(),
};

/**
 * One language. A language without a title is not saved; once it has one it needs a slug, and
 * publishing also needs content and an SEO description (decision 3, as for tours).
 */
function checkTranslation(
  value: { slug: string; title: string; content: unknown; seoDescription: string | null; isPublished: boolean },
  ctx: z.RefinementCtx,
) {
  if (!value.title) {
    if (value.isPublished) ctx.addIssue({ code: "custom", path: ["title"], message: "requiredToPublish" });
    return;
  }
  if (!isValidSlug(value.slug)) {
    ctx.addIssue({ code: "custom", path: ["slug"], message: value.slug ? "slugInvalid" : "required" });
  }
  if (value.isPublished) {
    if (richTextIsEmpty(value.content)) ctx.addIssue({ code: "custom", path: ["content"], message: "requiredToPublish" });
    if (!value.seoDescription) ctx.addIssue({ code: "custom", path: ["seoDescription"], message: "requiredToPublish" });
  }
}

export const postTranslationSchema = z
  .object({ ...translationFields, excerpt: optionalText(400) })
  .superRefine(checkTranslation);

export const pageTranslationSchema = z.object(translationFields).superRefine(checkTranslation);

function publishChecks(
  value: { status: string; translations: Record<ContentLocale, { title: string; isPublished: boolean }> },
  ctx: z.RefinementCtx,
) {
  if (!value.translations.vi.title) {
    ctx.addIssue({ code: "custom", path: ["translations", "vi", "title"], message: "required" });
  }
  if (value.status === "published" && !value.translations.vi.isPublished && !value.translations.en.isPublished) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "publishNeedsTranslation" });
  }
}

export const postSchema = z
  .object({
    id: z.uuid().optional(),
    status: z.enum(["draft", "published", "archived"]),
    categoryId: z.uuid().nullable(),
    coverMediaId: z.uuid().nullable(),
    translations: z.object({ vi: postTranslationSchema, en: postTranslationSchema }),
  })
  .superRefine((value, ctx) => {
    publishChecks(value, ctx);
    if (value.status === "published" && !value.coverMediaId) {
      ctx.addIssue({ code: "custom", path: ["coverMediaId"], message: "publishNeedsCover" });
    }
  });
export type PostInput = z.input<typeof postSchema>;
export type PostValues = z.output<typeof postSchema>;

export const pageSchema = z
  .object({
    key: z.enum(PAGE_KEYS),
    status: z.enum(["draft", "published", "archived"]),
    translations: z.object({ vi: pageTranslationSchema, en: pageTranslationSchema }),
  })
  .superRefine(publishChecks);
export type PageInput = z.input<typeof pageSchema>;
export type PageValues = z.output<typeof pageSchema>;

const categoryTranslationSchema = z
  .object({ slug: z.string().trim().max(80, "tooLong"), name: text(80) })
  .superRefine((value, ctx) => {
    if (!value.name) return;
    if (!isValidSlug(value.slug)) {
      ctx.addIssue({ code: "custom", path: ["slug"], message: value.slug ? "slugInvalid" : "required" });
    }
  });

export const categorySchema = z
  .object({
    id: z.uuid().optional(),
    sortOrder: z.number("wholeNumber").int("wholeNumber").min(0, "outOfRange").max(1000, "outOfRange"),
    translations: z.object({ vi: categoryTranslationSchema, en: categoryTranslationSchema }),
  })
  .superRefine((value, ctx) => {
    if (!value.translations.vi.name) ctx.addIssue({ code: "custom", path: ["translations", "vi", "name"], message: "required" });
  });
export type CategoryInput = z.input<typeof categorySchema>;
export type CategoryValues = z.output<typeof categorySchema>;

export const contentIdSchema = z.object({ id: z.uuid() });

export const contentSlugCheckSchema = z.object({
  kind: z.enum(["post", "page", "category"]),
  locale: z.enum(CONTENT_LOCALES),
  slug: z.string().trim().max(80),
  excludeId: z.uuid().optional(),
});
export type ContentKind = z.infer<typeof contentSlugCheckSchema>["kind"];
