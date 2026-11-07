"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { useListing } from "./tour-listing-form";

type Props = {
  /** The visible count ("31 hành trình"), announced politely when it changes. */
  count: string;
  heading: string;
  updating: string;
  page: number;
  children: ReactNode;
};

/**
 * Results while a new search loads: the old ones stay, dimmed and marked busy, with a thin
 * progress bar (no skeleton flash, §2.5). After a page change the results heading takes focus.
 */
export function TourResults({ count, heading, updating, page, children }: Props) {
  const { pending } = useListing();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastPage = useRef(page);

  useEffect(() => {
    if (lastPage.current !== page) headingRef.current?.focus();
    lastPage.current = page;
  }, [page]);

  return (
    <section aria-labelledby="tour-results-heading" aria-busy={pending || undefined} className="relative flex flex-col gap-8">
      <div aria-hidden="true" className={`absolute -top-3 left-0 h-0.5 bg-gold transition-[width,opacity] duration-500 ${pending ? "w-2/3 opacity-100" : "w-0 opacity-0"}`} />
      <h2 id="tour-results-heading" ref={headingRef} tabIndex={-1} className="sr-only">
        {heading}
      </h2>
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? updating : count}
      </p>
      <div className={pending ? "pointer-events-none opacity-60 transition-opacity duration-200" : "transition-opacity duration-200"}>{children}</div>
    </section>
  );
}
