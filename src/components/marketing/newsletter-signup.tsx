import { getTranslations } from "next-intl/server";

import { Section } from "@/components/layout/section";
import { SectionHeading } from "@/components/typography/section-heading";
import type { Locale } from "@/modules/catalog/public/types";
import { getPrivacyConsent } from "@/modules/content/public/content-public.service";
import { newsletterAvailability } from "@/modules/content/public/newsletter.service";

import { type NewsletterLabels, NewsletterForm } from "./newsletter-form";

/**
 * Newsletter section (double opt-in). The form works only when Turnstile, Upstash and Resend are
 * configured and the privacy policy it links is published in this language; otherwise it is shown
 * disabled with a short note.
 */
export async function NewsletterSignup({ locale }: { locale: Locale }) {
  const [t, privacy] = await Promise.all([
    getTranslations({ locale, namespace: "Home.newsletter" }),
    getPrivacyConsent(locale),
  ]);
  const siteKey = privacy ? newsletterAvailability().siteKey : null;
  const labels: NewsletterLabels = {
    email: t("email"),
    placeholder: t("placeholder"),
    submit: t("submit"),
    sending: t("sending"),
    privacy: t("privacy", { policy: "{policy}" }),
    privacyLink: t("privacyLink"),
    unavailable: t("unavailable"),
    success: t("success"),
    errors: {
      invalidEmail: t("errors.invalidEmail"),
      verification: t("errors.verification"),
      rateLimited: t("errors.rateLimited"),
      unavailable: t("errors.unavailable"),
      failed: t("errors.failed"),
    },
  };
  return (
    <Section tone="ivory" aria-labelledby="home-newsletter">
      <div className="grid gap-8 md:grid-cols-2 md:items-end md:gap-16">
        <SectionHeading eyebrow={t("eyebrow")} title={<span id="home-newsletter">{t("title")}</span>} description={t("text")} size="h3" />
        <NewsletterForm locale={locale} siteKey={siteKey} privacyHref={privacy?.href ?? null} labels={labels} />
      </div>
    </Section>
  );
}
