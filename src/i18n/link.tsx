import NextLink from "next/link";
import { getLocale } from "next-intl/server";
import type { ComponentProps } from "react";

import { type Locale, type LocalizedHref, localizedPath } from "./paths";

type Props = Omit<ComponentProps<typeof NextLink>, "href"> & { href: LocalizedHref; locale?: Locale };

/**
 * Localized link for server components of the public site. next-intl's own `Link` renders a client
 * component that reads the locale from `NextIntlClientProvider`, which would put next-intl's
 * message formatter into the initial JavaScript of every public page (Phase 3 spec decision 16).
 * This one resolves the path on the server and renders a plain `next/link`; client components use
 * `LocaleLink` from `@/components/layout/locale-link`.
 */
export async function Link({ href, locale, ...props }: Props) {
  const current = (await getLocale()) as Locale;
  const target = locale ?? current;
  return (
    <NextLink href={localizedPath(target, href)} hrefLang={target === current ? undefined : target} {...props} />
  );
}
