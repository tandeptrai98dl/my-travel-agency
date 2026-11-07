"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { CloseIcon, SlidersIcon } from "./icons";
import { GHOST_BUTTON, OUTLINE_BUTTON } from "./listing-classes";
import { onFinderInput, syncFilters } from "./listing-dom";
import { FILTER_PANEL_ID } from "./listing-ids";
import { useListing } from "./tour-listing-form";

function sheet(): HTMLDialogElement | null {
  return document.getElementById(FILTER_PANEL_ID) as HTMLDialogElement | null;
}

/** The inputs of the sheet back to what the URL says (staged changes dropped). */
function restore(dialog: HTMLDialogElement) {
  dialog.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    if (input.type === "checkbox" || input.type === "radio") {
      input.checked = input.defaultChecked;
      if (input.dataset.implied !== undefined) input.disabled = true;
    } else input.value = input.defaultValue;
  });
  dialog.querySelectorAll<HTMLLIElement>("li[hidden]").forEach((row) => {
    row.hidden = false;
  });
}

/**
 * "Filters (n)" below `lg`: opens the filter sheet (native modal `<dialog>`: focus is kept inside,
 * Escape closes it and focus returns to this button). Closing without "Apply" drops the staged
 * changes.
 */
export function FilterSheetButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-controls={FILTER_PANEL_ID}
      onClick={() => sheet()?.showModal()}
      className={`${OUTLINE_BUTTON} lg:hidden`}
    >
      <SlidersIcon className="h-5 w-5" />
      {label}
    </button>
  );
}

/**
 * The sheet's own form (outside the listing form, so forms never nest): changes are staged; Apply
 * sends them with the toolbar's search and sort and closes the sheet.
 */
export function FilterSheetForm({ action, children, className }: { action: string; children: ReactNode; className?: string }) {
  const { apply } = useListing();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const onChange = (event: Event) => syncFilters(form, event.target as HTMLInputElement);
    form.addEventListener("change", onChange);
    form.addEventListener("input", onFinderInput);
    return () => {
      form.removeEventListener("change", onChange);
      form.removeEventListener("input", onFinderInput);
    };
  }, []);

  return (
    <form
      ref={ref}
      method="get"
      action={action}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        apply(event.currentTarget);
        // "apply" tells the close handler to keep the choices (they are in the URL now).
        event.currentTarget.closest("dialog")?.close("apply");
      }}
    >
      {children}
    </form>
  );
}

/**
 * Close (×) in the sheet's header. It lives inside the sheet, which is rendered again after every
 * search, so it also owns the sheet's close handler.
 */
export function FilterSheetClose({ label }: { label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current?.closest("dialog");
    if (!dialog) return;
    const onClose = () => {
      if (dialog.returnValue !== "apply") restore(dialog);
      dialog.returnValue = "";
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => sheet()?.close()}
      className="flex h-11 w-11 items-center justify-center text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CloseIcon className="h-5 w-5" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

/** "Reset" in the sheet: clears every filter in it (applied only with "Apply"). */
export function FilterSheetReset({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const dialog = sheet();
        dialog?.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
          if (input.type === "checkbox") {
            input.checked = false;
            input.disabled = false;
          } else if (input.type === "radio") input.checked = input.value === "";
          else if (input.type !== "hidden") input.value = "";
        });
        // The destination finder is cleared too: show every row again.
        dialog?.querySelectorAll<HTMLLIElement>("li[hidden]").forEach((row) => {
          row.hidden = false;
        });
      }}
      className={GHOST_BUTTON}
    >
      {label}
    </button>
  );
}
