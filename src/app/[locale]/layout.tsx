import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { fontVariables } from "@/app/fonts";
import { ContactFloatingButton } from "@/components/layout/contact-floating-button";
import { CookieConsentBanner } from "@/components/layout/cookie-consent-banner";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";
import { getDestinationTree } from "@/modules/catalog/destinations.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

import "../globals.css";

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
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    metadataBase: siteUrl,
    title: { default: t("siteName"), template: `%s | ${t("siteName")}` },
    description: t("defaultDescription"),
  };
}

/** Root layout of the public website and customer account (VI default, EN under /en). */
export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // Only the namespaces client components use; everything else stays on the server.
  const messages = await getMessages();
  const clientMessages = {
    LanguageSwitcher: messages.LanguageSwitcher,
    Navigation: messages.Navigation,
    Consent: messages.Consent,
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
        <NextIntlClientProvider messages={clientMessages}>
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
