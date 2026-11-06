import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RichText } from "./rich-text";

const IMG = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const html = (content: unknown, props: Partial<Parameters<typeof RichText>[0]> = {}) =>
  renderToStaticMarkup(<RichText content={content} locale="vi" {...props} />);
const p = (...content: unknown[]) => ({ type: "doc", content: [{ type: "paragraph", content }] });

describe("RichText", () => {
  it("renders headings, lists, quotes and marks", () => {
    const out = html({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Ngày 1" }] },
        { type: "paragraph", content: [{ type: "text", text: "Đậm", marks: [{ type: "bold" }, { type: "italic" }] }] },
        { type: "orderedList", attrs: { start: 2 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Hai" }] }] }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Lặng" }] }] },
      ],
    });
    expect(out).toContain("<h3>Ngày 1</h3>");
    expect(out).toContain("<strong><em>Đậm</em></strong>");
    expect(out).toContain('<ol start="2"><li><p>Hai</p></li></ol>');
    expect(out).toContain("<blockquote><p>Lặng</p></blockquote>");
  });

  it("drops unknown nodes and raw HTML", () => {
    const out = html({
      type: "doc",
      content: [
        { type: "html", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
        { type: "paragraph", content: [{ type: "text", text: "<img src=x onerror=alert(1)>" }] },
      ],
    });
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("removes javascript: links and marks external links", () => {
    expect(html(p({ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }))).not.toContain("<a");
    expect(html(p({ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }))).toContain(
      '<a href="https://example.com" rel="noopener noreferrer">x</a>',
    );
    expect(html(p({ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "/tours" } }] }))).toContain('<a href="/tours">x</a>');
  });

  it("shows library images with the page language's alt text, never a URL from the JSON", () => {
    const content = { type: "doc", content: [{ type: "image", attrs: { mediaId: IMG, src: "https://evil.example/x.png" } }] };
    const media = { [IMG]: { url: "https://cdn.test/a.jpg", alt: { vi: "Vịnh", en: "The bay" }, width: 2400, height: 1600 } };
    const vi = html(content, { media });
    expect(vi).toContain('src="https://cdn.test/a.jpg"');
    expect(vi).toContain('alt="Vịnh"');
    expect(vi).not.toContain("evil.example");
    expect(html(content, { media, locale: "en" })).toContain('alt="The bay"');
    // Unknown media: nothing rendered.
    expect(html(content)).not.toContain("<img");
    // Public pages plug in their own image component.
    expect(html(content, { media, renderImage: ({ alt }) => <span data-alt={alt} /> })).toContain('<span data-alt="Vịnh"></span>');
  });
});
