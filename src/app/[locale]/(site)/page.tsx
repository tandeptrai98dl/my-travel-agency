import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "HomePage" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    // Placeholder until the public website is built in Phase 3.
    robots: { index: false, follow: false },
    alternates: {
      canonical: getPathname({ href: "/", locale }),
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, getPathname({ href: "/", locale: l })]),
      ),
    },
  };
}

// Temporary placeholder until the public website is built in Phase 3.
export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("HomePage");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="max-w-xl text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("eyebrow")}</p>
        <h1 className="mt-4 text-4xl font-medium md:text-5xl">{t("title")}</h1>
      </div>
      <LanguageSwitcher className="mt-12" />
    </main>
  );
}
