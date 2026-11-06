/**
 * Cache tags of public catalog reads (ADR-015, Phase 3 spec decision 3). Admin services refresh
 * them on save; public read modules tag their cached reads with them. No imports, so public code
 * can use them without loading the admin services.
 */
export const TOURS_TAG = "tours";
export const tourTag = (id: string) => `tour:${id}`;
export const DESTINATIONS_TAG = "destinations";
export const TRAVEL_STYLES_TAG = "travel-styles";
/** Tours embed cancellation-policy summaries. */
export const CANCELLATION_POLICIES_TAG = "cancellation-policies";
export const SETTINGS_TAG = "settings";
