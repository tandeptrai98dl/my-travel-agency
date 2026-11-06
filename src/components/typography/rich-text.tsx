import "server-only";

import type { ReactNode } from "react";

import {
  isExternalHref,
  type RichTextBlock,
  type RichTextList,
  type RichTextParagraph,
  type RichTextText,
  sanitizeRichText,
} from "@/lib/rich-text";

import { Prose } from "./prose";

/** What the renderer needs to show one media library image (looked up by the caller). */
export type RichTextMedia = {
  url: string;
  alt: { vi: string; en: string };
  width?: number | null;
  height?: number | null;
};

export type RichTextImageProps = { media: RichTextMedia; alt: string };

type Props = {
  /** Stored Tiptap JSON; sanitized again here, so stored data is never trusted. */
  content: unknown;
  locale: "vi" | "en";
  /** Images by media id; an image whose id is missing is left out. */
  media?: Record<string, RichTextMedia>;
  /** Replaces the plain `<img>` (public pages pass their responsive image component). */
  renderImage?: (props: RichTextImageProps) => ReactNode;
  className?: string;
};

function DefaultImage({ media, alt }: RichTextImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the default; public pages pass renderImage
    <img
      src={media.url}
      alt={alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      loading="lazy"
      decoding="async"
      className="h-auto w-full"
    />
  );
}

function Text({ node }: { node: RichTextText }) {
  let out: ReactNode = node.text;
  const marks = node.marks ?? [];
  if (marks.some((mark) => mark.type === "italic")) out = <em>{out}</em>;
  if (marks.some((mark) => mark.type === "bold")) out = <strong>{out}</strong>;
  const link = marks.find((mark) => mark.type === "link");
  if (link) {
    const href = link.attrs.href;
    out = isExternalHref(href) ? (
      <a href={href} rel="noopener noreferrer">
        {out}
      </a>
    ) : (
      <a href={href}>{out}</a>
    );
  }
  return <>{out}</>;
}

const inline = (nodes: RichTextText[] | undefined) => nodes?.map((node, i) => <Text key={i} node={node} />);

function Paragraph({ node }: { node: RichTextParagraph }) {
  return <p>{inline(node.content)}</p>;
}

function List({ node }: { node: RichTextList }) {
  const items = node.content.map((item, i) => (
    <li key={i}>
      {item.content.map((child, j) => (child.type === "paragraph" ? <Paragraph key={j} node={child} /> : <List key={j} node={child} />))}
    </li>
  ));
  if (node.type === "orderedList") return <ol start={node.attrs.start === 1 ? undefined : node.attrs.start}>{items}</ol>;
  return <ul>{items}</ul>;
}

/**
 * Renders rich text through the whitelist in `@/lib/rich-text` (decision 7): unknown nodes and
 * marks are dropped, unsafe links lose their link, external links get `rel="noopener noreferrer"`,
 * and images come from the media library with the alt text of the page's language.
 */
export function RichText({ content, locale, media = {}, renderImage = DefaultImage, className }: Props) {
  const doc = sanitizeRichText(content);
  const block = (node: RichTextBlock, key: number): ReactNode => {
    switch (node.type) {
      case "paragraph":
        return <Paragraph key={key} node={node} />;
      case "heading":
        return node.attrs.level === 2 ? <h2 key={key}>{inline(node.content)}</h2> : <h3 key={key}>{inline(node.content)}</h3>;
      case "bulletList":
      case "orderedList":
        return <List key={key} node={node} />;
      case "blockquote":
        return (
          <blockquote key={key}>
            {node.content.map((child, i) => (child.type === "paragraph" ? <Paragraph key={i} node={child} /> : <List key={i} node={child} />))}
          </blockquote>
        );
      case "image": {
        const item = media[node.attrs.mediaId];
        if (!item) return null;
        return <figure key={key}>{renderImage({ media: item, alt: item.alt[locale] || item.alt.vi || item.alt.en })}</figure>;
      }
    }
  };
  return <Prose className={className}>{doc.content.map(block)}</Prose>;
}
