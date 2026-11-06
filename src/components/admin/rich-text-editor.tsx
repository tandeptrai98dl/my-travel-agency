"use client";

import Image from "@tiptap/extension-image";
import { type Editor, EditorContent, type JSONContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { type MediaPickerLabels, MediaPicker } from "@/components/admin/media/media-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeHref, sanitizeRichText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/** Preview data for images already in the document (the JSON stores only their media id). */
export type EditorMedia = Record<string, { url: string; alt: string }>;

/**
 * Library images only: the node keeps the media id (what is stored) and shows the URL while
 * editing. Pasted `<img>` tags without an id are not images here, so outside images never enter.
 */
const LibraryImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-media-id"),
        renderHTML: (attributes: { mediaId?: string | null }) =>
          attributes.mediaId ? { "data-media-id": attributes.mediaId } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "img[data-media-id]" }];
  },
});

/** The fixed extension set of decision 7; everything else in StarterKit is switched off. */
const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
    horizontalRule: false,
    hardBreak: false,
    link: {
      openOnClick: false,
      autolink: true,
      isAllowedUri: (url) => safeHref(url) !== null,
      HTMLAttributes: { rel: null, target: null },
    },
  }),
  LibraryImage.configure({ inline: false, allowBase64: false }),
];

/** Stored JSON → editor content, with preview URLs for known images. */
function toEditor(value: unknown, media: EditorMedia): JSONContent {
  const doc = sanitizeRichText(value) as JSONContent;
  const visit = (node: JSONContent): JSONContent => {
    if (node.type === "image") {
      const id = node.attrs?.mediaId as string;
      return { ...node, attrs: { mediaId: id, src: media[id]?.url ?? "", alt: media[id]?.alt ?? "" } };
    }
    return node.content ? { ...node, content: node.content.map(visit) } : node;
  };
  return visit(doc);
}

type Props = {
  /** Stored Tiptap JSON. */
  value: unknown;
  /** Receives sanitized JSON (no preview URLs) on every change. */
  onChange: (value: unknown) => void;
  onBlur?: () => void;
  media: EditorMedia;
  pickerLabels: MediaPickerLabels;
  /** Id of the visible label, and of a description or error. */
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
};

export function RichTextEditor({ value, onChange, onBlur, media, pickerLabels, labelledBy, describedBy, invalid }: Props) {
  const t = useTranslations("Admin.Content.editor");
  // Each opening of the link dialog is a fresh session (its field starts from the current link).
  const [linkSession, setLinkSession] = useState<number | null>(null);
  const editor = useEditor({
    extensions,
    content: toEditor(value, media),
    // Rendered on the client only: the admin is dynamic and the markup would not match.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelledBy,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
        class: cn(
          "min-h-48 max-w-none px-4 py-3 text-body focus-visible:outline-none",
          "[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gold [&_blockquote]:pl-4 [&_blockquote]:italic",
          "[&_h2]:mt-6 [&_h2]:font-serif [&_h2]:text-h3 [&_h3]:mt-4 [&_h3]:font-semibold",
          "[&_img]:my-4 [&_img]:max-h-80 [&_img]:w-auto [&_img.ProseMirror-selectednode]:outline [&_img.ProseMirror-selectednode]:outline-2 [&_img.ProseMirror-selectednode]:outline-ring",
          "[&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&>*:first-child]:mt-0",
        ),
      },
    },
    onUpdate: ({ editor: current }) => onChange(sanitizeRichText(current.getJSON())),
    onBlur: () => onBlur?.(),
  });

  return (
    <div
      className={cn(
        "rounded-md border bg-card focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        invalid ? "border-destructive" : "border-input",
      )}
    >
      {editor ? <Toolbar editor={editor} pickerLabels={pickerLabels} onLink={() => setLinkSession((n) => (n ?? 0) + 1)} /> : <div className="h-12 border-b border-border" />}
      <EditorContent editor={editor} />
      {editor && linkSession !== null && <LinkDialog key={linkSession} editor={editor} onClose={() => setLinkSession(null)} />}
      <span className="sr-only">{t("hint")}</span>
    </div>
  );
}

function Toolbar({ editor, pickerLabels, onLink }: { editor: Editor; pickerLabels: MediaPickerLabels; onLink: () => void }) {
  const t = useTranslations("Admin.Content.editor");
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      paragraph: e.isActive("paragraph"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const tool = (key: string, label: string, Icon: typeof Bold, active: boolean | undefined, run: () => void, disabled = false) => (
    <Button
      key={key}
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className={cn("h-9 w-9", active && "text-foreground ring-1 ring-ring")}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
    </Button>
  );
  return (
    <div role="toolbar" aria-label={t("toolbar")} className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
      {tool("p", t("paragraph"), Pilcrow, state.paragraph, () => chain().setParagraph().run())}
      {tool("h2", t("heading2"), Heading2, state.h2, () => chain().toggleHeading({ level: 2 }).run())}
      {tool("h3", t("heading3"), Heading3, state.h3, () => chain().toggleHeading({ level: 3 }).run())}
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      {tool("b", t("bold"), Bold, state.bold, () => chain().toggleBold().run())}
      {tool("i", t("italic"), Italic, state.italic, () => chain().toggleItalic().run())}
      {tool("a", t("link"), Link2, state.link, onLink)}
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      {tool("ul", t("bulletList"), List, state.bullet, () => chain().toggleBulletList().run())}
      {tool("ol", t("orderedList"), ListOrdered, state.ordered, () => chain().toggleOrderedList().run())}
      {tool("q", t("quote"), Quote, state.quote, () => chain().toggleBlockquote().run())}
      <MediaPicker
        labels={pickerLabels}
        trigger={
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={t("image")} title={t("image")}>
            <ImagePlus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </Button>
        }
        onSelect={([item]) => {
          if (!item) return;
          chain()
            .insertContent({ type: "image", attrs: { mediaId: item.id, src: item.url, alt: item.alt.vi || item.alt.en } })
            .run();
        }}
      />
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      {tool("undo", t("undo"), Undo2, undefined, () => chain().undo().run(), !state.canUndo)}
      {tool("redo", t("redo"), Redo2, undefined, () => chain().redo().run(), !state.canRedo)}
    </div>
  );
}

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const t = useTranslations("Admin.Content.editor");
  const ts = useTranslations("Admin.Shell");
  const id = useId();
  const current = editor.getAttributes("link").href as string | undefined;
  const [href, setHref] = useState(current ?? "");
  const [error, setError] = useState(false);

  function apply() {
    const safe = safeHref(href);
    if (!safe) {
      setError(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        closeLabel={ts("close")}
        // No trigger to return to: focus goes back to the text.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          editor.commands.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("linkTitle")}</DialogTitle>
          <DialogDescription>{t("linkDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-href`}>{t("linkUrl")}</Label>
          <Input
            id={`${id}-href`}
            value={href}
            inputMode="url"
            spellCheck={false}
            aria-invalid={error || undefined}
            aria-describedby={`${id}-error`}
            onChange={(event) => {
              setHref(event.target.value);
              setError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Never submit the page's form from here.
                event.preventDefault();
                event.stopPropagation();
                apply();
              }
            }}
          />
          <p id={`${id}-error`} aria-live="polite" className="text-small font-medium text-destructive">
            {error ? t("linkInvalid") : null}
          </p>
        </div>
        <DialogFooter>
          {current && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                onClose();
              }}
            >
              {t("linkRemove")}
            </Button>
          )}
          <Button type="button" onClick={apply}>
            {t("linkApply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
