import { ExternalLink, Mail, MapPin, MessageCircle, Phone, Clock } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { ContactForm, type ContactFormLabels } from "@/components/content/contact-form";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { fixedLocaleLinks, pageMetadata } from "@/components/seo/page-metadata";
import { SectionHeading } from "@/components/typography/section-heading";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";
import { getPolicyLinks } from "@/modules/content/public/content-public.service";
import { contactAvailability } from "@/modules/inquiry/contact.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const links = () => fixedLocaleLinks({ vi: getPathname({ locale: "vi", href: "/contact" }), en: getPathname({ locale: "en", href: "/contact" }) });

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "ContactPage" });
  return pageMetadata({ locale, title: t("metaTitle"), description: t("metaDescription"), alternates: links() });
}

const digits = (value: string) => value.replace(/[^\d+]/g, "");

/**
 * Contact (Phase 3 PR K): company details, hotline, email, Zalo, WhatsApp, office hours and a map
 * link from settings (each only when set), and the contact form saved as an inquiry.
 */
export default async function ContactPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, tf, tp, settings, policies] = await Promise.all([
    getTranslations({ locale, namespace: "ContactPage" }),
    getTranslations({ locale, namespace: "ContactForm" }),
    getTranslations({ locale, namespace: "Pages" }),
    getPublicSettings(),
    getPolicyLinks(locale),
  ]);
  const company = settings.company;
  const contact = settings.contact;
  const address = company?.address?.[locale]?.trim() || null;
  const hours = contact?.office_hours?.[locale]?.trim() || null;
  const { siteKey } = contactAvailability();
  const labels: ContactFormLabels = {
    name: tf("name"),
    email: tf("email"),
    phone: tf("phone"),
    preferred: tf("preferred"),
    channels: { email: tf("channels.email"), phone: tf("channels.phone"), zalo: tf("channels.zalo"), whatsapp: tf("channels.whatsapp") },
    message: tf("message"),
    messageTour: tf("messageTour", { code: "{code}" }),
    messageTourDate: tf("messageTourDate", { code: "{code}", date: "{date}" }),
    consent: tf("consent"),
    privacyLink: tf("privacyLink"),
    newTab: tf("newTab"),
    submit: tf("submit"),
    sending: tf("sending"),
    unavailable: tf("unavailable"),
    success: tf("success", { code: "{code}" }),
    successNoCode: tf("successNoCode"),
    errors: Object.fromEntries(
      ["required", "tooLong", "invalidEmail", "invalidPhone", "tooShort", "consentRequired", "invalid", "verification", "rateLimited", "unavailable", "failed"].map((key) => [key, tf(`errors.${key}`)]),
    ),
  };
  const formProps = { locale, siteKey, privacyHref: policies.find((link) => link.key === "privacy")?.href ?? null, labels };
  const items = [
    address && {
      icon: MapPin,
      label: t("address"),
      value: address,
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
      linkText: t("map"),
      external: true,
    },
    contact?.phone && { icon: Phone, label: t("hotline"), value: contact.phone, href: `tel:${digits(contact.phone)}` },
    contact?.email && { icon: Mail, label: t("email"), value: contact.email, href: `mailto:${contact.email}` },
    contact?.zalo && { icon: MessageCircle, label: "Zalo", value: t("zalo"), href: `https://zalo.me/${digits(contact.zalo).replace(/^\+/, "")}`, external: true },
    contact?.whatsapp && { icon: MessageCircle, label: "WhatsApp", value: t("whatsapp"), href: `https://wa.me/${digits(contact.whatsapp).replace(/^\+/, "")}`, external: true },
    hours && { icon: Clock, label: t("hours"), value: hours },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string; href?: string; linkText?: string; external?: boolean }[];

  return (
    <Container className="flex flex-col gap-10 pb-24 pt-6 md:gap-14">
      <Breadcrumbs
        label={tp("breadcrumbLabel")}
        currentUrl={new URL(getPathname({ locale, href: "/contact" }), siteUrl).toString()}
        items={[{ label: tp("home"), href: getPathname({ locale, href: "/" }) }, { label: t("title") }]}
      />
      <SectionHeading level={1} size="h1" eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <section aria-labelledby="contact-details" className="flex flex-col gap-6 lg:col-span-5">
          <h2 id="contact-details" className="font-serif text-h3 font-semibold md:text-h3-lg">{t("detailsTitle")}</h2>
          {items.length > 0 && (
            <dl className="flex flex-col gap-5">
              {items.map(({ icon: Icon, label, value, href, linkText, external }) => (
                <div key={label} className="flex flex-col gap-1">
                  <dt className="flex items-center gap-3 text-eyebrow font-semibold uppercase text-muted-foreground">
                    <Icon className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} aria-hidden="true" />
                    {label}
                  </dt>
                  <dd className="flex flex-col gap-1 pl-8 text-body">
                    {href && !linkText ? (
                      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="inline-flex min-h-11 items-center gap-1 self-start underline decoration-gold underline-offset-4 hover:decoration-2">
                        {value}
                        {external && <span className="sr-only"> {t("newTab")}</span>}
                      </a>
                    ) : (
                      <span>{value}</span>
                    )}
                    {href && linkText && (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 self-start text-small underline decoration-gold underline-offset-4">
                        {linkText}
                        <ExternalLink className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                        <span className="sr-only"> {t("newTab")}</span>
                      </a>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {(company?.legal_name || company?.tour_operator_licence) && (
            <dl className="flex flex-col gap-2 border-t border-border pt-5 text-small text-muted-foreground">
              {company?.legal_name && (
                <div className="flex gap-2">
                  <dt>{t("company")}:</dt>
                  <dd>{company.legal_name}</dd>
                </div>
              )}
              {company?.tour_operator_licence && (
                <div className="flex gap-2">
                  <dt>{t("licence")}:</dt>
                  <dd>{company.tour_operator_licence}</dd>
                </div>
              )}
            </dl>
          )}
        </section>
        <section aria-labelledby="contact-form" className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 md:p-8 lg:col-span-7">
          <h2 id="contact-form" className="font-serif text-h3 font-semibold md:text-h3-lg">{t("formTitle")}</h2>
          {/* The prerendered shell has the plain form (it works without JavaScript); the version
              prefilled from ?tour=…&date=… streams in, since it reads searchParams (ADR-015). */}
          <Suspense fallback={<ContactForm {...formProps} />}>
            <PrefilledContactForm searchParams={searchParams} {...formProps} />
          </Suspense>
        </section>
      </div>
    </Container>
  );
}

type FormProps = Omit<React.ComponentProps<typeof ContactForm>, "tour">;

/** Reads the tour code and date of the tour page's call to action (validated) and prefills the form. */
async function PrefilledContactForm({ searchParams, ...props }: FormProps & Pick<Props, "searchParams">) {
  const query = await searchParams;
  const code = typeof query.tour === "string" && /^[A-Z0-9-]{1,40}$/.test(query.tour) ? query.tour : null;
  const date = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : null;
  return <ContactForm {...props} tour={code ? { code, date } : null} />;
}
