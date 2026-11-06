import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { fontVariables } from "@/app/fonts";
import { ContactFloatingButton } from "@/components/layout/contact-floating-button";
import { CookieConsentBanner } from "@/components/layout/cookie-consent-banner";
import { LabelsProvider, type LabelTree } from "@/components/layout/labels";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { isLocale, routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";
import { getDestinationTree } from "@/modules/catalog/destinations.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

import "../../globals.css";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

// Both locales are known at build time, so the layout can be prerendered (ADR-015).
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const [t, settings] = await Promise.all([
    getTranslations({ locale, namespace: "Metadata" }),
    getPublicSettings(),
  ]);
  // Same brand as the header and footer: the company name from settings, else the default.
  const siteName = settings.company?.name ?? t("siteName");
  return {
    metadataBase: siteUrl,
    title: { default: siteName, template: `%s | ${siteName}` },
    description: t("defaultDescription"),
  };
}

/** Root layout of the public website and customer account (VI default, EN under /en). */
export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  // Client strings: plain labels through a light context instead of NextIntlClientProvider, so no
  // message formatter reaches the initial JS of public pages (Phase 3 spec decision 16). Client
  // components here only show plain strings; anything formatted is rendered on the server.
  const messages = await getMessages();
  const plain = (value: unknown) => value as Record<string, string>;
  const labels: LabelTree = {
    LanguageSwitcher: plain(messages.LanguageSwitcher),
    Navigation: plain(messages.Navigation),
    Consent: plain(messages.Consent),
    TourDetailError: plain((messages.TourDetail as Record<string, unknown> | undefined)?.error),
  };

  // Shell data from Supabase (cached; CLAUDE.md rule 8: no business data in code).
  const [settings, destinations, t] = await Promise.all([
    getPublicSettings(),
    getDestinationTree(locale),
    getTranslations({ locale, namespace: "Navigation" }),
  ]);
  const tMeta = await getTranslations({ locale, namespace: "Metadata" });
  const brandName = settings.company?.name ?? tMeta("siteName");

  return (
    <html lang={locale} className={fontVariables}>
      <body className="flex min-h-screen flex-col">
        <LabelsProvider locale={locale} labels={labels}>
          <a
            href="#main"
            className="sr-only z-50 rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          >
            {t("skipToContent")}
          </a>
          <SiteHeader brandName={brandName} destinations={destinations} />
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <SiteFooter settings={settings} brandName={brandName} locale={locale} />
          <ContactFloatingButton contact={settings.contact} />
          <CookieConsentBanner />
        </LabelsProvider>
      </body>
    </html>
  );
}
