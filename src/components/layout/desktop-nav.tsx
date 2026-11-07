import { ChevronDown } from "lucide-react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

import { type Locale, type LocalizedHref, localizedPath } from "@/i18n/paths";
import type { DestinationNode } from "@/modules/catalog/destinations";

import { MegaMenu } from "./mega-menu";
import { PRIMARY_NAV } from "./nav-items";

type Props = { locale: Locale; destinations: DestinationNode[]; className?: string };

const linkClass =
  "inline-flex h-11 items-center gap-1 rounded-md px-3 text-small font-medium tracking-wide underline-offset-[10px] decoration-gold decoration-1 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The desktop navigation, rendered on the server: the links and the destinations panel
 * (countries → regions → cities) reach the browser as HTML, and only the panel's open and close
 * behaviour is client code (`MegaMenu`).
 */
export async function DesktopNav({ locale, destinations, className }: Props) {
  const t = await getTranslations({ locale, namespace: "Navigation" });
  const href = (target: LocalizedHref) => localizedPath(locale, target);
  const destination = (slug: string) => href({ pathname: "/destinations/[slug]", params: { slug } });
  const [tours, ...rest] = PRIMARY_NAV;
  const item = (entry: (typeof PRIMARY_NAV)[number]) => (
    <li key={entry.key}>
      <NextLink href={href(entry.href)} className={linkClass}>
        {t(entry.key)}
      </NextLink>
    </li>
  );

  return (
    <MegaMenu
      label={t("primary")}
      linkClass={linkClass}
      className={className}
      before={item(tours)}
      after={rest.map(item)}
      trigger={
        <>
          {t("destinations")}
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-aria-expanded:rotate-180" strokeWidth={1.5} aria-hidden="true" />
        </>
      }
      panel={
        <div className="mx-auto grid max-w-7xl gap-10 px-8 py-10 md:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
          {destinations.map((country) => (
            <div key={country.key} className="flex flex-col gap-4">
              <NextLink href={destination(country.slug)} className="font-serif text-h3 font-semibold hover:underline hover:decoration-gold">
                {country.name}
              </NextLink>
              <ul className="flex flex-col gap-3">
                {country.children.map((region) => (
                  <li key={region.key} className="flex flex-col gap-1.5">
                    <NextLink href={destination(region.slug)} className="text-small font-semibold hover:underline hover:decoration-gold">
                      {region.name}
                    </NextLink>
                    {region.children.length > 0 && (
                      <ul className="flex flex-wrap gap-x-3 gap-y-1">
                        {region.children.map((city) => (
                          <li key={city.key}>
                            <NextLink
                              href={destination(city.slug)}
                              className="text-small text-muted-foreground hover:text-foreground hover:underline hover:decoration-gold"
                            >
                              {city.name}
                            </NextLink>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex items-end">
            <NextLink href={href("/destinations")} className="text-small font-medium underline decoration-gold underline-offset-[6px]">
              {t("allDestinations")}
            </NextLink>
          </div>
        </div>
      }
    />
  );
}
