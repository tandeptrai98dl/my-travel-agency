import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { fontVariables } from "@/app/fonts";
import { CookieConsentBanner } from "@/components/layout/cookie-consent-banner";
import { LabelsProvider, type LabelTree } from "@/components/layout/labels";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getPathname } from "@/i18n/navigation";
import { isLocale, routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";
import { getDestinationTree } from "@/modules/catalog/destinations.service";
import { getPolicyLinks } from "@/modules/content/public/content-public.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

import "../../globals.css";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

// Nothing here is prerendered (ADR-027 option 2): every script must carry the proxy's nonce.
export const instant = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: "Metadata" }), getPublicSettings()]);
  const siteName = settings.company?.name ?? t("siteName");
  return {
    metadataBase: siteUrl,
    title: { default: siteName, template: `%s | ${siteName}` },
    // Checkout and account pages are personal: never indexed.
    robots: { index: false, follow: false },
  };
}

/**
 * Root layout of checkout and account (docs/specs/phase-4-booking-payments.md decision 12): the
 * same header and footer as the public site, rendered per request with the nonce CSP from
 * src/proxy.ts, beside the prerendered `(public)` root.
 */
export default async function SecureLayout({ children, params }: Props) {
  await connection();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();
  const plain = (value: unknown) => value as Record<string, string>;
  const labels: LabelTree = {
    LanguageSwitcher: plain(messages.LanguageSwitcher),
    Navigation: plain(messages.Navigation),
    Consent: plain(messages.Consent),
  };
  const [settings, destinations, t, tMeta, policyLinks] = await Promise.all([
    getPublicSettings(),
    getDestinationTree(locale),
    getTranslations({ locale, namespace: "Navigation" }),
    getTranslations({ locale, namespace: "Metadata" }),
    getPolicyLinks(locale),
  ]);
  const privacyHref = policyLinks.find((link) => link.key === "privacy")?.href ?? getPathname({ locale, href: "/contact" });
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
          <SiteFooter settings={settings} brandName={brandName} locale={locale} policyLinks={policyLinks} />
          <CookieConsentBanner privacyHref={privacyHref} />
        </LabelsProvider>
      </body>
    </html>
  );
}
