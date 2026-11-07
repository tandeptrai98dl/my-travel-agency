import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { Container } from "@/components/layout/container";
import { ConfirmNewsletterForm } from "@/components/marketing/confirm-newsletter-form";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import type { Locale } from "@/modules/catalog/public/types";
import { getPrivacyConsent } from "@/modules/content/public/content-public.service";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Omit<Props, "searchParams">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "NewsletterConfirm" });
  return {
    title: t("metaTitle"),
    // A personal, single-use page: never indexed, and the token never leaks through the referrer.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    alternates: { canonical: getPathname({ locale, href: "/newsletter/confirm" }) },
  };
}

/** Double opt-in confirmation page (newsletter); the token arrives in the emailed link. */
export default async function NewsletterConfirmPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, privacy] = await Promise.all([getTranslations({ locale, namespace: "NewsletterConfirm" }), getPrivacyConsent(locale)]);
  const labels = {
    title: t("title"),
    text: t("text"),
    button: t("button"),
    confirmedTitle: t("confirmedTitle"),
    confirmedText: t("confirmedText"),
    invalidTitle: t("invalidTitle"),
    invalidText: t("invalidText"),
    unavailable: t("unavailable"),
    backHome: t("backHome"),
    consent: t("consent", { policy: "{policy}" }),
    privacyLink: t("privacyLink"),
  };
  return (
    <Container className="py-32 md:py-40">
      <Suspense fallback={<h1 className="font-serif text-h1 font-medium md:text-h1-lg">{labels.title}</h1>}>
        <TokenForm searchParams={searchParams} locale={locale} privacyHref={privacy?.href ?? null} labels={labels} />
      </Suspense>
    </Container>
  );
}

type FormProps = Omit<Parameters<typeof ConfirmNewsletterForm>[0], "token" | "locale"> & { locale: Locale };

async function TokenForm({ searchParams, ...props }: Pick<Props, "searchParams"> & FormProps) {
  const value = (await searchParams).token;
  const token = typeof value === "string" && value.length <= 200 ? value : null;
  return <ConfirmNewsletterForm token={token} {...props} />;
}
