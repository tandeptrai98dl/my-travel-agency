"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";

import { type LocalizedHref, localizedPath } from "@/i18n/paths";

import { useShellLocale } from "./labels";

type Props = Omit<ComponentProps<typeof NextLink>, "href"> & { href: LocalizedHref };

/**
 * `next/link` to an internal route in the current page's language, for client components of the
 * public site (server components use `Link` from `@/i18n/navigation`). It avoids next-intl's client
 * provider and its message formatter in the initial JavaScript (Phase 3 spec decision 16).
 */
export function LocaleLink({ href, ...props }: Props) {
  const locale = useShellLocale();
  return <NextLink href={localizedPath(locale, href)} {...props} />;
}
