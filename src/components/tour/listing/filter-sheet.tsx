"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { buttonVariants } from "@/components/ui/button-variants";

import { FILTER_PANEL_ID } from "./tour-listing-form";

function panel(): HTMLDialogElement | null {
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
}

/**
 * "Filters (n)" below `lg`: opens the filter panel as a modal sheet (native `<dialog>`: focus is
 * kept inside, Escape closes it and focus returns to this button). Closing without "Apply" drops
 * the staged changes.
 */
export function FilterSheetButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-controls={FILTER_PANEL_ID}
      onClick={() => panel()?.showModal()}
      className={buttonVariants({ variant: "outline", className: "lg:hidden" })}
    >
      <SlidersHorizontal className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * Close (×) in the sheet's header. It lives inside the panel, which is rendered again after every
 * search, so it also owns the panel's close handler.
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
      onClick={() => panel()?.close()}
      className="flex h-11 w-11 items-center justify-center text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
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
        const dialog = panel();
        dialog?.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
          if (input.type === "checkbox") {
            input.checked = false;
            input.disabled = false;
          }
          else if (input.type === "radio") input.checked = input.value === "";
          else if (input.type !== "hidden") input.value = "";
        });
      }}
      className={buttonVariants({ variant: "ghost" })}
    >
      {label}
    </button>
  );
}
