"use client";

import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";

import { parseTourSearchParams, serializeTourSearchParams } from "@/modules/catalog/tour-search-params";

/** Id of the listing form; the filter panel is the `<dialog>` inside it with this id. */
export const LISTING_FORM_ID = "tour-search";
export const FILTER_PANEL_ID = "tour-filters";

type ListingContext = {
  pending: boolean;
  /** Reads the form and replaces the URL with its canonical search (page reset to 1). */
  apply: () => void;
  /** Whether the client code has started (filters then apply at once on desktop). */
  ready: boolean;
};

const Context = createContext<ListingContext>({ pending: false, apply: () => {}, ready: false });

export function useListing() {
  return useContext(Context);
}

/** The canonical query string of the form's current values (same parser as the server). */
export function formQuery(form: HTMLFormElement): string {
  const data = new FormData(form);
  const params = new URLSearchParams();
  for (const [name, value] of data) if (typeof value === "string" && value !== "") params.append(name, value);
  return serializeTourSearchParams({ ...parseTourSearchParams(params), page: 1 });
}

/** Folds case and Vietnamese diacritics (đ included) for matching. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
}

/**
 * The destination finder (an input with `data-filter-list`, shown above long lists) hides the
 * rows that do not match; ancestors of a match stay visible and hidden rows keep their choice.
 */
function filterList(input: HTMLInputElement) {
  const list = document.getElementById(input.dataset.filterList ?? "");
  if (!list) return;
  const term = fold(input.value);
  const rows = [...list.querySelectorAll<HTMLLIElement>("li")];
  const visible = new Set<HTMLElement>();
  for (const row of rows) {
    if (term && !fold(row.dataset.name ?? "").includes(term)) continue;
    for (let node: HTMLElement | null = row; node && node !== list; node = node.parentElement) visible.add(node);
  }
  for (const row of rows) row.hidden = !visible.has(row);
}

function panel(): HTMLDialogElement | null {
  return document.getElementById(FILTER_PANEL_ID) as HTMLDialogElement | null;
}

/**
 * The listing's GET form (docs/specs/tour-listing.md §2.4, §4.2). Without JavaScript it submits to
 * `/tours` like any form. With it, a change on desktop applies at once (`router.replace` in a
 * transition, so the old results stay, dimmed, until the new ones arrive); inside the open mobile
 * sheet changes are staged until "Apply". The URL stays the only state.
 */
export function TourListingForm({ action, children, className }: { action: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  const apply = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const query = formQuery(form);
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }, [router, pathname]);

  // The native `change` event (not React's onChange, which fires on every keystroke): text inputs
  // such as the custom price commit on blur or Enter, boxes and selects on every toggle.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const listener = (event: Event) => onChange(form, event.target as HTMLInputElement);
    const finder = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.dataset.filterList) filterList(target);
    };
    form.addEventListener("change", listener);
    form.addEventListener("input", finder);
    return () => {
      form.removeEventListener("change", listener);
      form.removeEventListener("input", finder);
    };
  });

  const onChange = (form: HTMLFormElement, target: HTMLInputElement) => {
    // Helpers without a name (the destination finder) are not part of the search.
    if (!target.name) return;
    // A preset and typed amounts are two ways to set one range: choosing one clears the other.
    if (target.name === "price") {
      for (const name of ["price_min", "price_max"]) {
        const input = form.elements.namedItem(name) as HTMLInputElement | null;
        if (input) input.value = "";
      }
    } else if (target.name === "dest" && target.closest("li")) {
      // A country or region includes the places below it: they show as chosen and step aside.
      target
        .closest("li")!
        .querySelectorAll<HTMLInputElement>("ul input[name='dest']")
        .forEach((child) => {
          child.checked = target.checked;
          child.disabled = target.checked;
        });
    } else if (target.name === "price_min" || target.name === "price_max") {
      form.querySelectorAll<HTMLInputElement>('input[name="price"]').forEach((radio) => {
        radio.checked = radio.value === "";
      });
    }
    // The search box applies itself (debounced); the open mobile sheet waits for "Apply".
    if (target.name === "q" || panel()?.open) return;
    apply();
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply();
    // "apply" tells the sheet's close handler to keep the choices (they are in the URL now).
    const sheet = panel();
    if (sheet?.open) sheet.close("apply");
  };

  return (
    <Context.Provider value={{ pending, apply, ready }}>
      <form
        ref={formRef}
        id={LISTING_FORM_ID}
        method="get"
        action={action}
        onSubmit={onSubmit}
        data-js={ready ? "" : undefined}
        className={className}
      >
        {children}
      </form>
    </Context.Provider>
  );
}
