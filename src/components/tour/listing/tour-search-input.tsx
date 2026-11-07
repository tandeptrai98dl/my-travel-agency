"use client";

import { useEffect, useRef, useState } from "react";

import { CloseIcon, SearchIcon } from "./icons";
import { useListing } from "./tour-listing-form";

type Props = { defaultValue: string; label: string; placeholder: string; clearLabel: string };

const DEBOUNCE_MS = 400;

/**
 * Search box of the listing: applies 400 ms after typing stops, or at once on Enter (the form's
 * submit). It follows the URL (Back/Forward) while it does not have focus.
 */
export function TourSearchInput({ defaultValue, label, placeholder, clearLabel }: Props) {
  const { apply } = useListing();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(apply, DEBOUNCE_MS);
  };

  return (
    <div role="search" className="relative w-full md:max-w-sm">
      <label htmlFor="tour-search-q" className="sr-only">
        {label}
      </label>
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        id="tour-search-q"
        type="search"
        name="q"
        value={value}
        maxLength={100}
        autoComplete="off"
        enterKeyHint="search"
        placeholder={placeholder}
        onChange={(event) => {
          setValue(event.target.value);
          schedule();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && timer.current) clearTimeout(timer.current);
        }}
        className="h-11 w-full rounded-md border border-input bg-card pl-10 pr-11 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            if (timer.current) clearTimeout(timer.current);
            // Let React write the empty value before the form is read.
            setTimeout(apply, 0);
            inputRef.current?.focus();
          }}
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CloseIcon className="h-4 w-4" />
          <span className="sr-only">{clearLabel}</span>
        </button>
      )}
    </div>
  );
}
