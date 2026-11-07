import "server-only";

import { createHash } from "node:crypto";

import { loadMessages, type MessageTree } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";

const cache = new Map<Locale, string>();

/** Every string of a message subtree, in key order, so the hash does not depend on file order. */
function flatten(tree: MessageTree, prefix = ""): [string, string][] {
  return Object.keys(tree)
    .sort()
    .flatMap((key) => {
      const value = tree[key];
      const at = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string" ? [[at, value] as [string, string]] : flatten(value, at);
    });
}

/** `banner-<locale>-<16 hex>`: the start of the SHA-256 of the banner and settings texts (the `Consent` messages). */
export function bannerVersionOf(locale: Locale, consentMessages: MessageTree): string {
  const digest = createHash("sha256").update(JSON.stringify(flatten(consentMessages))).digest("hex");
  return `banner-${locale}-${digest.slice(0, 16)}`;
}

/**
 * The version of the cookie banner a visitor saw in a language (like ADR-035's privacy versions):
 * it changes exactly when the wording of the banner or the settings dialog changes.
 */
export async function bannerVersion(locale: Locale): Promise<string> {
  const known = cache.get(locale);
  if (known) return known;
  const consent = (await loadMessages(locale)).Consent;
  if (!consent || typeof consent === "string") throw new Error("Consent messages missing");
  const version = bannerVersionOf(locale, consent);
  cache.set(locale, version);
  return version;
}
