"use client";

import { useEffect, useSyncExternalStore } from "react";

export type AlternateLinks = Record<string, { href: string; available: boolean }>;

let current: AlternateLinks | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current page's per-language paths, or null when the page published none. */
export function useLocaleAlternates(): AlternateLinks | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/**
 * Publishes the page's per-language paths to the language switcher in the header (Phase 3 spec
 * decision 6). Renders nothing. Pages with per-language slugs render it once.
 */
export function LocaleAlternates({ links }: { links: AlternateLinks }) {
  const key = JSON.stringify(links);
  useEffect(() => {
    const value = JSON.parse(key) as AlternateLinks;
    current = value;
    emit();
    return () => {
      if (current === value) {
        current = null;
        emit();
      }
    };
  }, [key]);
  return null;
}
