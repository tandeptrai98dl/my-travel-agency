"use client";

import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type Props = { className?: string };

/**
 * Links to the current page in each language, keeping the path (localized slugs included).
 * Minimal Phase 0 version; Phase 1 styles it as part of the site header.
 */
export function LanguageSwitcher({ className }: Props) {
  const t = useTranslations("LanguageSwitcher");
  const currentLocale = useLocale();
  const pathname = usePathname();
  const params = useParams();

  return (
    <nav aria-label={t("label")} className={cn("flex gap-4 text-sm", className)}>
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
            "underline-offset-4 hover:underline",
            locale === currentLocale && "font-semibold",
          )}
        >
          {t(locale)}
        </Link>
      ))}
    </nav>
  );
}
