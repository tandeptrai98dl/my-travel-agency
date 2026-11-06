"use client";

import { createContext, useCallback, useContext } from "react";

/**
 * Plain UI strings for the client components of the public shell (header, menus, language
 * switcher, consent). They hold no ICU placeholders, so a lookup is enough: this keeps next-intl's
 * message formatter (about 12 KB gzip) out of the initial JavaScript of public pages (Phase 3
 * spec decision 16). Components that format messages keep using next-intl.
 */
export type LabelTree = Record<string, Record<string, string>>;

const LabelsContext = createContext<LabelTree>({});

export function LabelsProvider({ labels, children }: { labels: LabelTree; children: React.ReactNode }) {
  return <LabelsContext.Provider value={labels}>{children}</LabelsContext.Provider>;
}

/** `t(key)` for one namespace; an unknown key returns the key, like next-intl in production. */
export function useLabels(namespace: string): (key: string) => string {
  const tree = useContext(LabelsContext);
  const strings = tree[namespace];
  return useCallback((key: string) => strings?.[key] ?? `${namespace}.${key}`, [strings, namespace]);
}
