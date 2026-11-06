"use client";

import { useTranslations } from "next-intl";

/** Content messages first (`Admin.Content.errors`), then the shared ones (`Admin.Taxonomy.errors`). */
export function useContentErrorText() {
  const own = useTranslations("Admin.Content.errors");
  const shared = useTranslations("Admin.Taxonomy.errors");
  return (key: string) => (own.has(key) ? own(key) : shared.has(key) ? shared(key) : shared("invalid"));
}
