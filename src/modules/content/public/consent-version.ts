import "server-only";

import { createHash } from "node:crypto";

import type { Locale } from "@/modules/catalog/public/types";

/**
 * The version recorded in `consent_records.document_version` when someone agrees to the privacy
 * policy (Decree 13/2023: proof of what was agreed to). It names the language and a hash of the
 * published title and content, so it changes exactly when the text changes; the text behind a
 * version can be found in `audit_logs` (page translation changes are logged with before/after).
 * jsonb comes back from Postgres with its keys in a fixed order, so the hash is stable.
 */
export function privacyConsentVersion(locale: Locale, title: string, content: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify([title, content ?? null])).digest("hex");
  return `privacy-${locale}-${digest.slice(0, 16)}`;
}
