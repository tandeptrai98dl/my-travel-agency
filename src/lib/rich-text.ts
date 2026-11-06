/**
 * Rich text stored as Tiptap JSON (ADR-014, docs/specs/phase-2-catalog-admin.md decision 7).
 *
 * One fixed set of nodes and marks, shared by the admin editor, the save path (which stores only
 * sanitized JSON) and the public renderer (which sanitizes again before rendering):
 *   blocks  paragraph, heading (levels 2–3), bulletList, orderedList, listItem, blockquote, image
 *   inline  text with the marks bold, italic and link
 * Anything else is dropped. Links keep only http(s), mailto:, tel:, site-relative paths and
 * fragments; images keep only a media library id (their URL and alt text come from `media`).
 *
 * Pure and isomorphic: no React, no Supabase.
 */

export type RichTextMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "link"; attrs: { href: string } };

export type RichTextText = { type: "text"; text: string; marks?: RichTextMark[] };
export type RichTextParagraph = { type: "paragraph"; content?: RichTextText[] };
export type RichTextHeading = { type: "heading"; attrs: { level: 2 | 3 }; content?: RichTextText[] };
export type RichTextImage = { type: "image"; attrs: { mediaId: string } };
export type RichTextListItem = { type: "listItem"; content: (RichTextParagraph | RichTextList)[] };
export type RichTextList =
  | { type: "bulletList"; content: RichTextListItem[] }
  | { type: "orderedList"; attrs: { start: number }; content: RichTextListItem[] };
export type RichTextQuote = { type: "blockquote"; content: (RichTextParagraph | RichTextList)[] };
export type RichTextBlock = RichTextParagraph | RichTextHeading | RichTextList | RichTextQuote | RichTextImage;
export type RichTextDoc = { type: "doc"; content: RichTextBlock[] };

export const RICH_TEXT_NODES = [
  "doc",
  "paragraph",
  "heading",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "image",
] as const;
export const RICH_TEXT_MARKS = ["bold", "italic", "link"] as const;

/** Stored documents above this size (UTF-8 bytes) are refused by the admin schemas. */
export const RICH_TEXT_MAX_BYTES = 300_000;
const MAX_DEPTH = 12;
const MAX_NODES = 10_000;
const MAX_TEXT = 20_000;
const MAX_HREF = 2_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const emptyRichText = (): RichTextDoc => ({ type: "doc", content: [{ type: "paragraph" }] });

// Links -------------------------------------------------------------------------------------------

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const RELATIVE_BASE = "https://relative.invalid";

/**
 * The link target if it is safe, otherwise null. URL parsing first (it removes tabs and newlines,
 * so `java\nscript:` is caught), then an allow-list of protocols; protocol-relative `//host` and
 * backslash tricks are refused because they would leave the site.
 */
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href || href.length > MAX_HREF) return null;
  if (href.startsWith("#")) return /^#[\w-]*$/.test(href) ? href : null;
  if (href.startsWith("/")) {
    if (href.startsWith("//") || href.includes("\\")) return null;
    try {
      return new URL(href, RELATIVE_BASE).origin === RELATIVE_BASE ? href : null;
    } catch {
      return null;
    }
  }
  try {
    return LINK_PROTOCOLS.has(new URL(href).protocol) ? href : null;
  } catch {
    return null;
  }
}

/**
 * Absolute web links leave the site: they get `rel="noopener noreferrer"`. Read from the parsed
 * protocol, so `http:host` (which browsers open as http://host/) counts too.
 */
export function isExternalHref(href: string): boolean {
  try {
    const { protocol } = new URL(href);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Size of a stored document in UTF-8 bytes (Vietnamese letters take two or three). */
export function richTextBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
}

// Sanitizing ----------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const children = (node: Raw): unknown[] => (Array.isArray(node.content) ? node.content : []);

class Budget {
  nodes = 0;
  spend(): boolean {
    this.nodes += 1;
    return this.nodes <= MAX_NODES;
  }
}

function sanitizeMarks(value: unknown): RichTextMark[] {
  if (!Array.isArray(value)) return [];
  const marks: RichTextMark[] = [];
  const seen = new Set<string>();
  for (const mark of value) {
    if (!isObject(mark) || typeof mark.type !== "string" || seen.has(mark.type)) continue;
    if (mark.type === "bold" || mark.type === "italic") {
      marks.push({ type: mark.type });
    } else if (mark.type === "link") {
      const href = safeHref(isObject(mark.attrs) ? mark.attrs.href : undefined);
      if (!href) continue;
      marks.push({ type: "link", attrs: { href } });
    } else {
      continue;
    }
    seen.add(mark.type);
  }
  return marks;
}

function sanitizeInline(nodes: unknown[], budget: Budget): RichTextText[] {
  const out: RichTextText[] = [];
  for (const node of nodes) {
    if (!isObject(node) || node.type !== "text" || typeof node.text !== "string" || !budget.spend()) continue;
    const text = node.text.slice(0, MAX_TEXT);
    if (!text) continue;
    const marks = sanitizeMarks(node.marks);
    out.push(marks.length ? { type: "text", text, marks } : { type: "text", text });
  }
  return out;
}

function withContent<T extends { content?: RichTextText[] }>(node: T, content: RichTextText[]): T {
  return content.length ? { ...node, content } : node;
}

function sanitizeParagraph(node: Raw, budget: Budget): RichTextParagraph {
  return withContent<RichTextParagraph>({ type: "paragraph" }, sanitizeInline(children(node), budget));
}

function sanitizeList(node: Raw, depth: number, budget: Budget): RichTextList | null {
  const items: RichTextListItem[] = [];
  for (const item of children(node)) {
    if (!isObject(item) || item.type !== "listItem" || !budget.spend()) continue;
    const content = sanitizeNested(children(item), depth + 1, budget);
    // ProseMirror needs a paragraph first in a list item.
    if (content[0]?.type !== "paragraph") content.unshift({ type: "paragraph" });
    items.push({ type: "listItem", content });
  }
  if (items.length === 0) return null;
  if (node.type === "orderedList") {
    const raw = isObject(node.attrs) ? node.attrs.start : undefined;
    const start = typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 10_000 ? raw : 1;
    return { type: "orderedList", attrs: { start }, content: items };
  }
  return { type: "bulletList", content: items };
}

/** Inside list items and quotes: paragraphs and lists only. */
function sanitizeNested(nodes: unknown[], depth: number, budget: Budget): (RichTextParagraph | RichTextList)[] {
  const out: (RichTextParagraph | RichTextList)[] = [];
  if (depth > MAX_DEPTH) return out;
  for (const node of nodes) {
    if (!isObject(node) || !budget.spend()) continue;
    if (node.type === "paragraph") out.push(sanitizeParagraph(node, budget));
    else if (node.type === "bulletList" || node.type === "orderedList") {
      const list = sanitizeList(node, depth, budget);
      if (list) out.push(list);
    }
  }
  return out;
}

function sanitizeBlock(node: unknown, budget: Budget): RichTextBlock | null {
  if (!isObject(node) || typeof node.type !== "string" || !budget.spend()) return null;
  switch (node.type) {
    case "paragraph":
      return sanitizeParagraph(node, budget);
    case "heading": {
      const raw = isObject(node.attrs) ? Number(node.attrs.level) : 2;
      // Level 1 is the page title; deeper levels collapse to 3.
      const level: 2 | 3 = raw >= 3 ? 3 : 2;
      return withContent<RichTextHeading>({ type: "heading", attrs: { level } }, sanitizeInline(children(node), budget));
    }
    case "bulletList":
    case "orderedList":
      return sanitizeList(node, 1, budget);
    case "blockquote": {
      const content = sanitizeNested(children(node), 1, budget);
      return content.length ? { type: "blockquote", content } : null;
    }
    case "image": {
      const mediaId = isObject(node.attrs) ? node.attrs.mediaId : undefined;
      return typeof mediaId === "string" && UUID.test(mediaId)
        ? { type: "image", attrs: { mediaId: mediaId.toLowerCase() } }
        : null;
    }
    default:
      return null;
  }
}

/** Any input → a document of whitelisted nodes and marks (never throws). */
export function sanitizeRichText(input: unknown): RichTextDoc {
  const budget = new Budget();
  const content = isObject(input) && input.type === "doc" ? children(input) : [];
  const blocks = content.map((node) => sanitizeBlock(node, budget)).filter((node): node is RichTextBlock => node !== null);
  return blocks.length ? { type: "doc", content: blocks } : emptyRichText();
}

// Reading -------------------------------------------------------------------------------------------

function walk(node: unknown, visit: (node: Raw) => void, depth = 0) {
  if (!isObject(node) || depth > MAX_DEPTH * 2) return;
  visit(node);
  for (const child of children(node)) walk(child, visit, depth + 1);
}

/** Media library ids of the images in a document, in order, without repeats. */
export function richTextMediaIds(doc: unknown): string[] {
  const ids: string[] = [];
  walk(doc, (node) => {
    const id = node.type === "image" && isObject(node.attrs) ? node.attrs.mediaId : undefined;
    if (typeof id === "string" && UUID.test(id) && !ids.includes(id.toLowerCase())) ids.push(id.toLowerCase());
  });
  return ids;
}

/** True when a document has no text and no image (an "empty" editor still holds a paragraph). */
export function richTextIsEmpty(doc: unknown): boolean {
  let empty = true;
  walk(doc, (node) => {
    if (node.type === "image" || (node.type === "text" && typeof node.text === "string" && node.text.trim())) empty = false;
  });
  return empty;
}

/** Plain text of a document (search, excerpts, meta descriptions). */
export function richTextPlainText(doc: unknown): string {
  const parts: string[] = [];
  walk(doc, (node) => {
    if (node.type === "text" && typeof node.text === "string") parts.push(node.text);
    else if (node.type === "paragraph" || node.type === "heading") parts.push(" ");
  });
  return parts.join("").replace(/\s+/g, " ").trim();
}
