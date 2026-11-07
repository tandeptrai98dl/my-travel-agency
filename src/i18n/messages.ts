import type { Locale } from "./routing";

/**
 * UI strings live in one file per area (`messages/<locale>/<file>.json`, ADR-025), so parallel
 * work streams edit different files. Each file holds part of the message tree; they are merged
 * here, and a key defined in two files is an error (caught by `messages.test.ts`).
 */
export const MESSAGE_FILES = [
  "public",
  "public-home",
  "public-tours",
  "public-pages",
  "public-booking",
  "admin",
  "admin-media",
  "admin-taxonomy",
  "admin-tours",
  "admin-departures",
  "admin-content",
  "admin-settings",
  "admin-bookings",
  "admin-inquiries",
  "emails",
  "auth",
  "account",
] as const;

export type MessageTree = { [key: string]: string | MessageTree };

/** Deep-merges message trees; throws on a key defined twice. */
export function mergeMessages(parts: MessageTree[], path = ""): MessageTree {
  const merged: MessageTree = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      const at = path ? `${path}.${key}` : key;
      const current = merged[key];
      if (current === undefined) merged[key] = value;
      else if (typeof current === "object" && typeof value === "object") merged[key] = mergeMessages([current, value], at);
      else throw new Error(`Message key "${at}" is defined in more than one file`);
    }
  }
  return merged;
}

export async function loadMessages(locale: Locale): Promise<MessageTree> {
  const parts = await Promise.all(
    MESSAGE_FILES.map(async (file) => (await import(`../../messages/${locale}/${file}.json`)).default as MessageTree),
  );
  return mergeMessages(parts);
}
