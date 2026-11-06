"use client";

import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /**
   * Render as a `nav` landmark (default). The footer and the mobile menu pass `false` so screen
   * readers do not list several identical "Language" landmarks.
   */
  landmark?: boolean;
};

/**
 * Links to the current page in each language, keeping the path (localized slugs included). Used
 * in the header, the mobile menu and the footer; colours follow the surrounding theme.
 */
export function LanguageSwitcher({ className, landmark = true }: Props) {
  const t = useTranslations("LanguageSwitcher");
  const currentLocale = useLocale();
  const pathname = usePathname();
  const params = useParams();

  const Wrapper = landmark ? "nav" : "div";

  return (
    <Wrapper
      role={landmark ? undefined : "group"}
      aria-label={t("label")}
      className={cn("flex items-center gap-1 text-small", className)}
    >
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          // The current route's params always match its pathname.
          // @ts-expect-error -- next-intl cannot type an arbitrary current pathname with its params.
          href={{ pathname, params }}
          locale={locale}
          hrefLang={locale}
          aria-current={locale === currentLocale ? "true" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-md px-2 underline-offset-[6px] decoration-gold transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            locale === currentLocale ? "font-semibold underline" : "opacity-80 hover:opacity-100",
          )}
        >
          {/* Each language name is written in its own language (WCAG 3.1.2). */}
          <span lang={locale}>{t(locale)}</span>
        </Link>
      ))}
    </Wrapper>
  );
}
