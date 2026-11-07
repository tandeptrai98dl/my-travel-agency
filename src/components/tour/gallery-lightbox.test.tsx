import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImageData } from "@/lib/images";

// Unit tests run in Node without a DOM (no React Testing Library or jsdom in the stack), so the
// Radix dialog is replaced by a stand-in that records the props the lightbox gives it. The test
// then plays Radix's documented close sequence: Escape calls `onEscapeKeyDown`, and unless that
// prevented it, `onOpenChange(false)`; on unmount the focus scope calls `onCloseAutoFocus` and, unless
// that prevented it, focuses the trigger (there is none here, so focus would fall to <body>).
type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };
type ContentProps = {
  onEscapeKeyDown?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onKeyDown?: (event: { key: string }) => void;
};
const captured: { dialog?: DialogProps; content?: ContentProps } = {};

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, ...props }: DialogProps & { children: ReactNode }) => {
    captured.dialog = props;
    return <>{children}</>;
  },
  DialogContent: ({ children, ...props }: ContentProps & { children: ReactNode; closeLabel: string; className?: string }) => {
    captured.content = props;
    return <div role="dialog">{children}</div>;
  },
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

const { default: GalleryLightbox } = await import("./gallery-lightbox");

const image = (n: number): ImageData => ({ src: `https://example.test/${n}.jpg`, width: 2400, height: 1600, alt: `Ảnh ${n}`, blurDataUrl: null });
const labels = { viewAll: "Xem {count} ảnh", dialogTitle: "Ảnh hành trình", close: "Đóng", previous: "Ảnh trước", next: "Ảnh sau", counter: "{index} / {count}" };

function renderLightbox() {
  const onOpenChange = vi.fn();
  const returnFocus = vi.fn();
  const html = renderToStaticMarkup(
    <GalleryLightbox open onOpenChange={onOpenChange} returnFocus={returnFocus} images={[image(1), image(2)]} title="Du thuyền" labels={labels} />,
  );
  return { html, onOpenChange, returnFocus };
}

/** Radix's Escape-then-unmount sequence, as Dialog and FocusScope run it. */
function pressEscapeAsRadix() {
  const escape = new Event("keydown", { cancelable: true });
  captured.content?.onEscapeKeyDown?.(escape);
  if (!escape.defaultPrevented) captured.dialog?.onOpenChange(false);
  const unmount = new Event("focusScope.autoFocusOnUnmount", { cancelable: true });
  captured.content?.onCloseAutoFocus?.(unmount);
  return { escape, unmount };
}

describe("GalleryLightbox", () => {
  beforeEach(() => {
    captured.dialog = undefined;
    captured.content = undefined;
  });

  it("renders the open dialog with the photo counter", () => {
    const { html } = renderLightbox();
    expect(captured.dialog?.open).toBe(true);
    expect(html).toContain("Ảnh hành trình");
    expect(html).toContain("1 / 2 · Ảnh 1");
  });

  it("Escape closes the lightbox", () => {
    const { onOpenChange } = renderLightbox();
    const { escape } = pressEscapeAsRadix();
    expect(escape.defaultPrevented).toBe(false);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("focus returns to the opener, not to <body>, once it has closed", () => {
    const { returnFocus } = renderLightbox();
    expect(returnFocus).not.toHaveBeenCalled();
    const { unmount } = pressEscapeAsRadix();
    // Prevented, so Radix does not move focus itself (to a missing trigger, that is <body>).
    expect(unmount.defaultPrevented).toBe(true);
    expect(returnFocus).toHaveBeenCalledOnce();
  });
});
