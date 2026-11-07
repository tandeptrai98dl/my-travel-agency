import { localizedPath, type Locale } from "@/i18n/paths";

import { type TourSearchCriteria, serializeTourSearchParams } from "./tour-search-params";

/** The listing URL of a search in one language (canonical query, defaults left out). */
export function listingHref(locale: Locale, criteria: Partial<TourSearchCriteria>): string {
  const query = serializeTourSearchParams(criteria);
  const path = localizedPath(locale, "/tours");
  return query ? `${path}?${query}` : path;
}
