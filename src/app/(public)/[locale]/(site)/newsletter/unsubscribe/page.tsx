import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { Container } from "@/components/layout/container";
import { type UnsubscribeLabels, UnsubscribeNewsletterForm } from "@/components/marketing/unsubscribe-newsletter-form";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Omit<Props, "searchParams">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "NewsletterUnsubscribe" });
  return {
    title: t("metaTitle"),
    // A personal, single-use page: never indexed, and the token never leaks through the referrer.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    alternates: { canonical: getPathname({ locale, href: "/newsletter/unsubscribe" }) },
  };
}

/** Newsletter unsubscribe (Phase 6 step 10a); the token arrives in the newsletter's link. */
export default async function NewsletterUnsubscribePage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "NewsletterUnsubscribe" });
  const keys = ["title", "text", "button", "doneTitle", "doneText", "alreadyTitle", "alreadyText", "invalidTitle", "invalidText", "unavailable", "backHome"] as const;
  const labels = Object.fromEntries(keys.map((key) => [key, t(key)])) as UnsubscribeLabels;
  return (
    <Container className="py-32 md:py-40">
      <Suspense fallback={<h1 className="font-serif text-h1 font-medium md:text-h1-lg">{labels.title}</h1>}>
        <TokenForm searchParams={searchParams} labels={labels} />
      </Suspense>
    </Container>
  );
}

async function TokenForm({ searchParams, labels }: Pick<Props, "searchParams"> & { labels: UnsubscribeLabels }) {
  const value = (await searchParams).token;
  const token = typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  return <UnsubscribeNewsletterForm token={token} labels={labels} />;
}
