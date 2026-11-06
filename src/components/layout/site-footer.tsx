import { cacheLife } from "next/cache";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { features } from "@/lib/features";
import type { PolicyLink } from "@/modules/content/public/content-public.service";
import type { PublicSettings } from "@/modules/settings/settings.schemas";

import { Container } from "./container";
import { CookieSettingsButton } from "./cookie-settings-button";
import { LanguageSwitcher } from "./language-switcher";
import { PRIMARY_NAV } from "./nav-items";

type Props = { settings: PublicSettings; brandName: string; locale: "vi" | "en"; policyLinks: PolicyLink[] };

/** Cached so prerendering does not read the clock on every request (Cache Components). */
async function currentYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

const headingClass = "text-eyebrow font-semibold uppercase text-gold";
const linkClass = "text-small text-muted-foreground transition-colors hover:text-foreground";

/**
 * Site footer: navigation, contact and the legal details Vietnamese e-commerce rules require
 * (company, tax code, tour operator licence, Ministry notification). Business data comes from
 * `settings`; each item renders only when set (CLAUDE.md rule 8).
 */
export async function SiteFooter({ settings, brandName, locale, policyLinks }: Props) {
  const t = await getTranslations("Footer");
  const tNav = await getTranslations("Navigation");
  const { company, contact, social } = settings;
  const address = company?.address?.[locale];
  const officeHours = contact?.office_hours?.[locale];
  const socialLinks = Object.entries(social).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  const year = await currentYear();
  const legalLines = [
    company?.legal_name && t("legalName", { value: company.legal_name }),
    company?.tax_code && t("taxCode", { value: company.tax_code }),
    company?.tour_operator_licence && t("licence", { value: company.tour_operator_licence }),
  ].filter((line): line is string => Boolean(line));
  const newTab = <span className="sr-only"> ({t("newTab")})</span>;

  return (
    <footer className="theme-navy bg-background">
      <Container className="grid gap-12 py-16 md:grid-cols-2 md:py-20 lg:grid-cols-4">
        <div className="flex flex-col gap-4">
          <p className="font-serif text-h3 font-semibold">{brandName}</p>
          {address && <p className="text-small text-muted-foreground">{address}</p>}
          {legalLines.length > 0 && (
            <ul className="flex flex-col gap-1 text-small text-muted-foreground">
              {legalLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {company?.ecommerce_notification_url && (
            <a
              href={company.ecommerce_notification_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-small underline decoration-gold underline-offset-4"
            >
              {t("ecommerceNotification")}
              {newTab}
            </a>
          )}
        </div>

        <nav aria-label={t("explore")} className="flex flex-col gap-4">
          <h2 className={headingClass}>{t("explore")}</h2>
          <ul className="flex flex-col gap-2">
            <li>
              <Link href="/destinations" className={linkClass}>
                {tNav("destinations")}
              </Link>
            </li>
            {PRIMARY_NAV.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className={linkClass}>
                  {tNav(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t("help")} className="flex flex-col gap-4">
          <h2 className={headingClass}>{t("help")}</h2>
          <ul className="flex flex-col gap-2">
            <li>
              <Link href="/faq" className={linkClass}>
                {t("faq")}
              </Link>
            </li>
            {features.booking && (
              <li>
                <Link href="/booking-lookup" className={linkClass}>
                  {t("bookingLookup")}
                </Link>
              </li>
            )}
            {/* Policies published in this language, at their per-language slugs (decision 15). */}
            {policyLinks.map((policy) => (
              <li key={policy.key}>
                <NextLink href={policy.href} className={linkClass}>
                  {policy.title}
                </NextLink>
              </li>
            ))}
            <li>
              <CookieSettingsButton label={t("cookieSettings")} className={`${linkClass} text-left`} />
            </li>
          </ul>
        </nav>

        <div className="flex flex-col gap-4">
          <h2 className={headingClass}>{t("contactTitle")}</h2>
          <ul className="flex flex-col gap-2 text-small">
            {contact?.phone && (
              <li>
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                  {contact.phone}
                </a>
              </li>
            )}
            {contact?.email && (
              <li>
                <a href={`mailto:${contact.email}`} className="hover:underline">
                  {contact.email}
                </a>
              </li>
            )}
            {officeHours && (
              <li className="text-muted-foreground">
                {t("officeHours")}: {officeHours}
              </li>
            )}
          </ul>
          {socialLinks.length > 0 && (
            <ul aria-label={t("social")} className="flex flex-wrap gap-4 text-small">
              {socialLinks.map(([name, url]) => (
                <li key={name}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="capitalize hover:underline">
                    {name}
                    {newTab}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
      <div className="border-t border-border">
        <Container className="flex flex-col gap-4 py-6 text-small text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>{t("rights", { year, name: company?.legal_name ?? brandName })}</p>
          <LanguageSwitcher landmark={false} />
        </Container>
      </div>
    </footer>
  );
}
