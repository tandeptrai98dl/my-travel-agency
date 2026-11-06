"use client";

import { useTranslations } from "next-intl";

/** Tour-specific messages first (`Admin.Tours.errors`), then the shared ones (`Admin.Taxonomy.errors`). */
export function useTourErrorText() {
  const tours = useTranslations("Admin.Tours.errors");
  const shared = useTranslations("Admin.Taxonomy.errors");
  return (key: string) => (tours.has(key) ? tours(key) : shared.has(key) ? shared(key) : shared("invalid"));
}
