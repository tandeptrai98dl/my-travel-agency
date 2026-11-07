"use client";

import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";

import { LISTING_FORM_ID } from "./listing-ids";
import { onFinderInput, searchQuery, syncFilters } from "./listing-dom";

type ListingContext = {
  pending: boolean;
  /**
   * Replaces the URL with the canonical search (page reset to 1): the toolbar of the listing form
   * with the filters of `filters` (the mobile sheet's form), or of the listing form's own column.
   */
  apply: (filters?: HTMLFormElement) => void;
  /** Whether the client code has started (filters then apply at once on desktop). */
  ready: boolean;
};

const Context = createContext<ListingContext>({ pending: false, apply: () => {}, ready: false });

export function useListing() {
  return useContext(Context);
}

/**
 * The listing's GET form (docs/specs/tour-listing.md §2.4, §4.2) holding the toolbar and the
 * desktop filter column. Without JavaScript it submits to `/tours` like any form. With it, a change
 * applies at once (`router.replace` in a transition, so the old results stay, dimmed, until the new
 * ones arrive). The mobile sheet (`sheet`) is a modal `<dialog>` with its own form, rendered after
 * this one, whose choices are staged until "Apply". The URL stays the only state.
 */
export function TourListingForm({ action, children, sheet, className }: { action: string; children: ReactNode; sheet?: ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  const apply = useCallback(
    (filters?: HTMLFormElement) => {
      const form = formRef.current;
      if (!form) return;
      const query = searchQuery(form, filters ?? form);
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [router, pathname],
  );

  // The native `change` event (not React's onChange, which fires on every keystroke): text inputs
  // such as the custom price commit on blur or Enter, boxes and selects on every toggle.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onChange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      // The search box applies itself (debounced).
      if (syncFilters(form, target) && target.name !== "q") apply();
    };
    form.addEventListener("change", onChange);
    form.addEventListener("input", onFinderInput);
    return () => {
      form.removeEventListener("change", onChange);
      form.removeEventListener("input", onFinderInput);
    };
  }, [apply]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply();
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
      {sheet}
    </Context.Provider>
  );
}
