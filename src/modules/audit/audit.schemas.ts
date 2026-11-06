/** Tables that carry the audit trigger (supabase/migrations/20261106140000_audit_triggers.sql). */
export const AUDITED_ENTITIES = [
  "tours",
  "tour_translations",
  "tour_media",
  "tour_destinations",
  "tour_travel_styles",
  "price_tiers",
  "departures",
  "cancellation_policies",
  "destinations",
  "destination_translations",
  "travel_styles",
  "travel_style_translations",
  "posts",
  "post_translations",
  "post_categories",
  "post_category_translations",
  "pages",
  "page_translations",
  "reviews",
  "media",
  "redirects",
  "settings",
  "profiles",
] as const;

export type AuditedEntity = (typeof AUDITED_ENTITIES)[number];

export const AUDIT_SORTS = ["created_at", "action", "entity_type"] as const;
export type AuditSort = (typeof AUDIT_SORTS)[number];

export type AuditEntry = {
  id: string;
  createdAt: string;
  action: string;
  operation: "insert" | "update" | "delete" | null;
  entityType: string;
  entityId: string;
  actor: { id: string; email: string; name: string | null } | null;
  changes: unknown;
};

/** "tours.update" → "update" (null for actions written by other code paths later). */
export function operationOf(action: string): AuditEntry["operation"] {
  const op = action.split(".").pop();
  return op === "insert" || op === "update" || op === "delete" ? op : null;
}
