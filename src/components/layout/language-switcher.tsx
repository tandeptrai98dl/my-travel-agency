"use client";

import { usePathname } from "next/navigation";

import { switchLocalePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { cx } from "@/lib/cx";

import { useLocaleAlternates } from "./locale-alternates";
import { useLabels, useShellLocale } from "./labels";

type Props = {
  className?: string;
  /**
   * Render as a `nav` landmark (default). The footer and the mobile menu pass `false` so screen
   * readers do not list several identical "Language" landmarks.
   */
  landmark?: boolean;
};

/**
 * Links to the current page in each language, keeping the path (localized slugs included). Pages
 * with per-language slugs publish their paths through `LocaleAlternates`; a language without a
 * published translation links to its parent page (Phase 3 spec decision 6). Used in the header, the
 * mobile menu and the footer; colours follow the surrounding theme.
 *
 * Plain links, so switching loads the other language's page in full. With `next/link` the router
 * prefetched Vietnamese paths from an English page through its own route guess: unprefixed
 * Vietnamese paths are proxy rewrites, so `/lien-he` looked like the home page of a locale called
 * "lien-he" and every prefetch answered 404 (and taught later prefetches the same guess).
 */
/**
 * The fallback link keeps the query string (a filtered listing stays filtered in the other
 * language; filter values are language-independent keys). Prerendered HTML cannot know the query,
 * so the link takes the current one just before it is used: pointer, focus or click.
 */
function keepQuery(event: { currentTarget: HTMLAnchorElement }) {
  const link = event.currentTarget;
  link.setAttribute("href", (link.getAttribute("href") ?? "").split("?")[0] + window.location.search);
}

export function LanguageSwitcher({ className, landmark = true }: Props) {
  const t = useLabels("LanguageSwitcher");
  const currentLocale = useShellLocale();
  const pathname = usePathname();
  const alternates = useLocaleAlternates();

  const Wrapper = landmark ? "nav" : "div";

  return (
    <Wrapper
      role={landmark ? undefined : "group"}
      aria-label={t("label")}
      className={cx("flex items-center gap-1 text-small", className)}
    >
      {routing.locales.map((locale) => {
        const className = cx(
          "inline-flex min-h-11 items-center rounded-md px-2 underline-offset-[6px] decoration-gold transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          locale === currentLocale ? "font-semibold underline" : "opacity-80 hover:opacity-100",
        );
        // Each language name is written in its own language (WCAG 3.1.2).
        const name = <span lang={locale}>{t(locale)}</span>;
        const alternate = alternates?.[locale];
        if (alternate) {
          return (
            <a
              key={locale}
              href={alternate.href}
              hrefLang={locale}
              aria-current={locale === currentLocale ? "true" : undefined}
              title={alternate.available ? undefined : t("unavailable")}
              className={className}
            >
              {name}
            </a>
          );
        }
        return (
          <a
            key={locale}
            href={switchLocalePath(pathname, locale)}
            onPointerEnter={keepQuery}
            onFocus={keepQuery}
            onClick={keepQuery}
            hrefLang={locale}
            aria-current={locale === currentLocale ? "true" : undefined}
            className={className}
          >
            {name}
          </a>
        );
      })}
    </Wrapper>
  );
}
