"use client";

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

import { cx } from "@/lib/cx";

type Props = {
  /** The navigation's accessible name. */
  label: string;
  /** Classes shared by the top-level links and the disclosure button. */
  linkClass: string;
  /** Server-rendered content: the items before and after the destinations item, the button's text
   *  and icon, and the panel of destination links. */
  before: ReactNode;
  trigger: ReactNode;
  panel: ReactNode;
  after: ReactNode;
  className?: string;
};

/**
 * Desktop navigation with the destinations panel, built as a disclosure: a button that shows and
 * hides a panel of links (WAI-ARIA disclosure navigation). Only the open and close behaviour runs
 * in the browser; every link, the button's label and the whole panel are rendered on the server
 * (`DesktopNav`), so they add nothing to the initial JavaScript (Phase 3 spec decision 16). The
 * panel follows its button in the DOM, so Tab moves into it; Escape, a click outside or focus
 * leaving the navigation closes it.
 */
export function MegaMenu({ label, linkClass, before, trigger, panel, after, className }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const navRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  // When the pointer opened the panel just before a click, that click must not close it again.
  const hoverOpenedAt = useRef(0);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Hover opens and closes the panel for mouse users, with a short grace period to cross the gap.
  const hoverOpen = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    setOpen((value) => {
      if (!value) hoverOpenedAt.current = performance.now();
      return true;
    });
  };
  const hoverClose = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  return (
    <nav
      ref={navRef}
      aria-label={label}
      className={cx("static", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close(true);
        }
      }}
      onBlur={(event) => {
        if (open && !navRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <ul className="flex items-center gap-1">
        {before}
        <li onPointerEnter={hoverOpen} onPointerLeave={hoverClose}>
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            className={cx(linkClass, "group", open && "underline")}
            onClick={() => {
              // The hover state may not have rendered yet when the click arrives: keep it open.
              if (performance.now() - hoverOpenedAt.current < 600) setOpen(true);
              else setOpen((value) => !value);
            }}
          >
            {trigger}
          </button>
          {/* Full-width panel under the header (the header is the positioning context). */}
          <div id={panelId} hidden={!open} className="absolute inset-x-0 top-full border-b border-border bg-background text-foreground">
            {panel}
          </div>
        </li>
        {after}
      </ul>
    </nav>
  );
}
