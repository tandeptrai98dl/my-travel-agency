import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading } from "@/components/typography/heading";
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
    <div className="theme-navy flex min-h-screen flex-col justify-center bg-background pb-16 pt-28">
      <Container className="flex flex-col items-center gap-6 text-center">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <Heading level={1} size="display" className="max-w-4xl">
          {t("title")}
        </Heading>
        <div aria-hidden="true" className="h-px w-16 bg-gold" />
        <LanguageSwitcher className="mt-6" />
      </Container>
    </div>
  );
}
