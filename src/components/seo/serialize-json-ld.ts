// Characters that could end a script element, open a comment or break older JS parsers
// (U+2028 and U+2029, built from char codes so the source stays ASCII).
const UNSAFE = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, "g");

function escapeChar(char: string): string {
  return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
}

/** JSON for a `<script type="application/ld+json">`, safe to inline in HTML. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, escapeChar);
}
