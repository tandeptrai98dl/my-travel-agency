import type { PublicSettings } from "@/modules/settings/settings.schemas";

/**
 * `TravelAgency` (also `Organization`) structured data for the home page (Phase 3 spec decision
 * 10), from `settings.company`, `contact` and `social`; only fields that are set.
 */
export function travelAgencyJsonLd({
  settings,
  locale,
  name,
  url,
}: {
  settings: PublicSettings;
  locale: "vi" | "en";
  name: string;
  url: string;
}): Record<string, unknown> {
  const company = settings.company;
  const contact = settings.contact;
  const address = company?.address?.[locale]?.trim() || company?.address?.vi?.trim();
  const sameAs = Object.values(settings.social).filter((value): value is string => typeof value === "string" && value.length > 0);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["TravelAgency", "Organization"],
    name,
    url,
  };
  if (company?.legal_name) data.legalName = company.legal_name;
  if (company?.tax_code) data.taxID = company.tax_code;
  if (contact?.phone) data.telephone = contact.phone;
  if (contact?.email) data.email = contact.email;
  if (address) data.address = { "@type": "PostalAddress", streetAddress: address, addressCountry: "VN" };
  if (sameAs.length) data.sameAs = sameAs;
  return data;
}
