import { describe, expect, it } from "vitest";

import {
  emptyRichText,
  isExternalHref,
  richTextBytes,
  richTextIsEmpty,
  richTextMediaIds,
  richTextPlainText,
  safeHref,
  sanitizeRichText,
} from "./rich-text";

const IMG = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("safeHref", () => {
  it("keeps web, mail, phone, site-relative and fragment links", () => {
    expect(safeHref(" https://example.com/a?b=1 ")).toBe("https://example.com/a?b=1");
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(safeHref("mailto:hello@example.com")).toBe("mailto:hello@example.com");
    expect(safeHref("tel:+84901234567")).toBe("tel:+84901234567");
    expect(safeHref("/journal/ha-long")).toBe("/journal/ha-long");
    expect(safeHref("#lich-trinh")).toBe("#lich-trinh");
  });

  it("refuses script, data and links that leave the site in disguise", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\nscript:alert(1)",
      " \tjavascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "//evil.example",
      "/\\evil.example",
      "ftp://example.com",
      "#<script>",
      "",
      42,
      `https://example.com/${"a".repeat(2001)}`,
    ]) {
      expect(safeHref(href), String(href)).toBeNull();
    }
  });

  it("treats only absolute web links as external", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("/tours")).toBe(false);
    expect(isExternalHref("mailto:a@b.c")).toBe(false);
    // Browsers open `http:host` as http://host/.
    expect(isExternalHref("http:example.com")).toBe(true);
    expect(isExternalHref("HTTPS://example.com")).toBe(true);
  });
});

describe("sanitizeRichText", () => {
  it("keeps the whitelisted nodes and marks as they are", () => {
    const input = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Vịnh Hạ Long")] },
      { type: "paragraph", content: [text("Một ", [{ type: "bold" }]), text("đêm", [{ type: "italic" }])] },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("Kayak")] }] }],
      },
      { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [{ type: "paragraph" }] }] },
      { type: "blockquote", content: [{ type: "paragraph", content: [text("Lặng gió")] }] },
      { type: "image", attrs: { mediaId: IMG } },
      { type: "paragraph", content: [text("Đặt tour", [{ type: "link", attrs: { href: "/tours" } }])] },
    );
    expect(sanitizeRichText(input)).toEqual(input);
    // Idempotent: sanitized output passes through unchanged.
    expect(sanitizeRichText(sanitizeRichText(input))).toEqual(input);
  });

  it("drops unknown nodes and marks and anything an attacker adds", () => {
    const result = sanitizeRichText(
      doc(
        { type: "codeBlock", content: [text("rm -rf /")] },
        { type: "iframe", attrs: { src: "https://evil.example" } },
        { type: "horizontalRule" },
        {
          type: "paragraph",
          attrs: { style: "color:red", onclick: "alert(1)" },
          content: [
            text("a", [{ type: "strike" }, { type: "bold", attrs: { class: "x" } }]),
            { type: "hardBreak" },
            { type: "mention", attrs: { id: "x" } },
            { type: "text", text: 5 },
          ],
        },
      ),
    );
    expect(result).toEqual(doc({ type: "paragraph", content: [text("a", [{ type: "bold" }])] }));
  });

  it("removes unsafe links but keeps their text", () => {
    const result = sanitizeRichText(
      doc({ type: "paragraph", content: [text("bấm", [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "italic" }])] }),
    );
    expect(result).toEqual(doc({ type: "paragraph", content: [text("bấm", [{ type: "italic" }])] }));
  });

  it("clamps heading levels, list starts and invalid images", () => {
    const result = sanitizeRichText(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [text("H1")] },
        { type: "heading", attrs: { level: 5 }, content: [text("H5")] },
        { type: "orderedList", attrs: { start: -4 }, content: [{ type: "listItem", content: [{ type: "bulletList", content: [] }] }] },
        { type: "image", attrs: { mediaId: "../../etc/passwd", src: "https://evil.example/x.png" } },
        { type: "image", attrs: { src: "https://evil.example/x.png" } },
      ),
    );
    expect(result).toEqual(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [text("H1")] },
        { type: "heading", attrs: { level: 3 }, content: [text("H5")] },
        // A list item always starts with a paragraph (ProseMirror); empty lists disappear.
        { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [{ type: "paragraph" }] }] },
      ),
    );
  });

  it("never throws and falls back to an empty document", () => {
    for (const input of [null, undefined, "doc", 42, [], { type: "paragraph" }, { type: "doc", content: "x" }]) {
      expect(sanitizeRichText(input)).toEqual(emptyRichText());
    }
  });

  it("stops at deep nesting and huge documents", () => {
    let nested: Record<string, unknown> = { type: "paragraph", content: [text("deep")] };
    for (let i = 0; i < 50; i += 1) nested = { type: "blockquote", content: [{ type: "bulletList", content: [{ type: "listItem", content: [nested] }] }] };
    expect(() => sanitizeRichText(doc(nested))).not.toThrow();
    const many = doc(...Array.from({ length: 20_000 }, () => ({ type: "paragraph", content: [text("x")] })));
    expect(sanitizeRichText(many).content.length).toBeLessThan(10_000);
  });
});

describe("richTextBytes", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(richTextBytes("ặ")).toBe(5); // two quotes + three bytes
    expect(richTextBytes(null)).toBe(4);
  });
});

describe("reading rich text", () => {
  it("lists image ids, finds empty documents and extracts plain text", () => {
    const value = doc(
      { type: "paragraph", content: [text("Xin"), text(" chào")] },
      { type: "image", attrs: { mediaId: IMG } },
      { type: "blockquote", content: [{ type: "paragraph" }, { type: "image", attrs: { mediaId: IMG.toUpperCase() } }] },
    );
    expect(richTextMediaIds(value)).toEqual([IMG]);
    expect(richTextIsEmpty(value)).toBe(false);
    expect(richTextIsEmpty(emptyRichText())).toBe(true);
    expect(richTextIsEmpty(doc({ type: "paragraph", content: [text("   ")] }))).toBe(true);
    expect(richTextPlainText(value)).toBe("Xin chào");
  });
});
