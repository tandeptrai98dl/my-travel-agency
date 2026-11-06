import { z } from "zod";

/**
 * Reader's view of `settings.homepage` (public). The shape is the cross-stream agreement of the
 * Phase 3 spec: Stream A owns the setting and its editor (`settings.schemas.ts`), this module only
 * reads it. Every field is optional and an invalid value falls back to "not set", so a bad edit
 * hides one section instead of breaking the page.
 */
const localized = z
  .object({ vi: z.string().optional(), en: z.string().optional() })
  .partial()
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);

export const homepageSettingSchema = z
  .object({
    hero: z
      .object({
        eyebrow: localized,
        title: localized,
        // Optional (decision 18): without a usable image the hero is the navy band.
        media_id: z.uuid().nullish().catch(null).transform((value) => value ?? null),
      })
      .nullish()
      .catch(null)
      .transform((value) => value ?? null),
    featured_destination_keys: z.array(z.string().min(1).max(60)).max(6).catch([]).default([]),
    journal_teaser_count: z.number().int().min(0).max(6).catch(3).default(3),
  })
  .catch({ hero: null, featured_destination_keys: [], journal_teaser_count: 3 });

export type HomepageSetting = z.infer<typeof homepageSettingSchema>;
