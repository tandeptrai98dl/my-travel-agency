import "server-only";

import { mediaUrl } from "@/lib/images";
import { richTextMediaIds } from "@/lib/rich-text";
import { findMediaByIds } from "@/modules/catalog/public/tour-public.repository";
import type { Locale } from "@/modules/catalog/public/types";

/** An image inside rich content, as the `RichText` renderer takes it. */
export type ContentMedia = { url: string; alt: { vi: string; en: string }; width: number | null; height: number | null };

/** The images a rich-text document uses, by media id (anon read; errors throw). */
export async function contentMediaMap(content: unknown): Promise<Record<string, ContentMedia>> {
  const ids = richTextMediaIds(content);
  if (ids.length === 0) return {};
  const { data, error } = await findMediaByIds(ids);
  if (error) throw new Error(`content images failed: ${error.message}`);
  return Object.fromEntries(
    (data ?? []).map((row) => {
      const alt = (row.alt ?? {}) as Partial<Record<Locale, string>>;
      return [row.id, { url: mediaUrl(row.path), alt: { vi: alt.vi ?? "", en: alt.en ?? "" }, width: row.width, height: row.height }];
    }),
  );
}
