"use client";

import { createContext, useCallback, useContext } from "react";

import type { Locale } from "@/i18n/paths";

/**
 * Plain UI strings for the client components of the public shell (header, menus, language
 * switcher, consent). They hold no ICU placeholders, so a lookup is enough: this keeps next-intl's
 * message formatter (about 12 KB gzip) out of the initial JavaScript of public pages (Phase 3
 * spec decision 16). The provider also carries the page's locale for `LocaleLink`, so public
 * client components need no `NextIntlClientProvider`.
 */
export type LabelTree = Record<string, Record<string, string>>;

type Shell = { locale: Locale; labels: LabelTree };

const ShellContext = createContext<Shell>({ locale: "vi", labels: {} });

export function LabelsProvider({ locale, labels, children }: Shell & { children: React.ReactNode }) {
  return <ShellContext.Provider value={{ locale, labels }}>{children}</ShellContext.Provider>;
}

/** The language of the current page. */
export function useShellLocale(): Locale {
  return useContext(ShellContext).locale;
}

/** `t(key)` for one namespace; an unknown key returns the key, like next-intl in production. */
export function useLabels(namespace: string): (key: string) => string {
  const strings = useContext(ShellContext).labels[namespace];
  return useCallback((key: string) => strings?.[key] ?? `${namespace}.${key}`, [strings, namespace]);
}
