import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { BookingForm } from "@/components/booking/booking-form";
import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading } from "@/components/typography/heading";
import { Skeleton } from "@/components/ui/skeleton";
import { getPathname, Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { bookingEnabled, getBookingForm } from "@/modules/booking/checkout.service";
import { getPolicyLinks, getPrivacyConsent } from "@/modules/content/public/content-public.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

import { BookingMessages } from "../../messages";

type Props = {
  params: Promise<{ locale: string; tourSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale, tourSlug } = await params;
  if (!isLocale(locale)) return {};
  const [t, form] = await Promise.all([getTranslations({ locale, namespace: "Booking" }), getBookingForm(locale, tourSlug)]);
  return { title: form ? t("metaTitle", { title: form.tour.title }) : undefined };
}

/** Book a group tour (docs/specs/phase-4-booking-payments.md step 7, decision 13). */
export default async function BookPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Container className="flex flex-col gap-10 py-12 md:py-16">
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" aria-hidden="true" />}>
        <Book params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const count = (value: string | undefined, min: number, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= 50 ? parsed : fallback;
};

async function Book({ params, searchParams }: Props) {
  const { locale, tourSlug } = (await params) as { locale: Locale; tourSlug: string };
  const t = await getTranslations({ locale, namespace: "Booking" });
  const form = await getBookingForm(locale, tourSlug);
  if (!form) notFound();
  const tourHref = getPathname({ locale, href: { pathname: "/tours/[slug]", params: { slug: form.tour.slug } } });

  const header = (
    <div className="flex flex-col gap-3">
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <Heading level={1} size="h1">
        {form.tour.title}
      </Heading>
      <Link href={{ pathname: "/tours/[slug]", params: { slug: form.tour.slug } }} className="self-start text-small underline underline-offset-4">
        {t("backToTour")}
      </Link>
    </div>
  );

  // Consent needs a published privacy policy (decision 9), as the newsletter does.
  const privacy = await getPrivacyConsent(locale);
  if (!bookingEnabled() || !privacy || form.departures.length === 0) {
    const settings = await getPublicSettings();
    const phone = settings.contact?.phone ?? null;
    const email = settings.contact?.email ?? null;
    return (
      <>
        {header}
        <section className="flex max-w-[680px] flex-col gap-4 rounded-lg border border-border bg-card p-6">
          <h2 className="font-serif text-h3 font-semibold">{bookingEnabled() && privacy ? t("noDepartures") : t("unavailableTitle")}</h2>
          {!(bookingEnabled() && privacy) && <p className="text-body text-muted-foreground">{t("unavailableBody")}</p>}
          <p className="flex flex-wrap gap-4 text-body">
            {phone && <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="underline underline-offset-4">{phone}</a>}
            {email && <a href={`mailto:${email}`} className="underline underline-offset-4">{email}</a>}
            <a href={tourHref} className="underline underline-offset-4">{t("backToTour")}</a>
          </p>
        </section>
      </>
    );
  }

  // Decision 13: ?departure=&adults=&children= from the tour page, each validated with a fallback.
  const query = await searchParams;
  const requested = first(query.departure);
  const departure = form.departures.find((item) => item.id === requested) ?? form.departures[0];
  const adults = Math.max(count(first(query.adults), 1, Math.max(form.tour.minPax, 2)), 1);
  const children = count(first(query.children), 0, 0);
  const policyLinks = await getPolicyLinks(locale);
  const policy = form.tour.policy ? (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-small">
      <h3 className="font-semibold">{t("policyTitle")}</h3>
      {form.tour.policy.summary && <p className="text-muted-foreground">{form.tour.policy.summary}</p>}
      <ul className="flex flex-col gap-1">
        {form.tour.policy.rules.map((rule) => (
          <li key={rule.minDaysBefore}>{t("policyRule", { days: rule.minDaysBefore, percent: rule.refundPercent })}</li>
        ))}
      </ul>
    </div>
  ) : null;

  return (
    <>
      {header}
      <BookingMessages locale={locale}>
        <BookingForm
          locale={locale}
          tour={form.tour}
          departures={form.departures}
          initial={{ departureId: departure.id, adults: Math.min(adults, departure.seatsLeft), children: Math.min(children, Math.max(departure.seatsLeft - adults, 0)) }}
          turnstileSiteKey={form.turnstileSiteKey}
          checkoutPath={getPathname({ locale, href: { pathname: "/checkout/[code]/payment", params: { code: "{code}" } } }).replace(encodeURIComponent("{code}"), "{code}")}
          links={{ terms: policyLinks.find((link) => link.key === "terms")?.href ?? null, privacy: privacy.href }}
          policy={policy}
        />
      </BookingMessages>
    </>
  );
}
