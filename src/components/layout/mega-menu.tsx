"use client";

import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { DestinationNode } from "@/modules/catalog/destinations";

import { PRIMARY_NAV } from "./nav-items";

type Props = { destinations: DestinationNode[]; className?: string };

const linkClass =
  "inline-flex h-11 items-center gap-1 rounded-md px-3 text-small font-medium tracking-wide underline-offset-[10px] decoration-gold decoration-1 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Desktop navigation with the destinations mega menu (countries → regions → cities). */
export function MegaMenu({ destinations, className }: Props) {
  const t = useTranslations("Navigation");
  const [tours, ...rest] = PRIMARY_NAV;

  return (
    <NavigationMenu.Root className={cn("static", className)} aria-label={t("primary")}>
      <NavigationMenu.List className="flex items-center gap-1">
        <NavigationMenu.Item>
          <NavigationMenu.Link asChild>
            <Link href={tours.href} className={linkClass}>
              {t(tours.key)}
            </Link>
          </NavigationMenu.Link>
        </NavigationMenu.Item>

        <NavigationMenu.Item>
          <NavigationMenu.Trigger className={cn(linkClass, "group data-[state=open]:underline")}>
            {t("destinations")}
            <ChevronDown
              className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="w-full">
            <div className="mx-auto grid max-w-7xl gap-10 px-8 py-10 md:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
              {destinations.map((country) => (
                <div key={country.key} className="flex flex-col gap-4">
                  <NavigationMenu.Link asChild>
                    <Link
                      href={{ pathname: "/destinations/[slug]", params: { slug: country.slug } }}
                      className="font-serif text-h3 font-semibold hover:underline hover:decoration-gold"
                    >
                      {country.name}
                    </Link>
                  </NavigationMenu.Link>
                  <ul className="flex flex-col gap-3">
                    {country.children.map((region) => (
                      <li key={region.key} className="flex flex-col gap-1.5">
                        <NavigationMenu.Link asChild>
                          <Link
                            href={{ pathname: "/destinations/[slug]", params: { slug: region.slug } }}
                            className="text-small font-semibold hover:underline hover:decoration-gold"
                          >
                            {region.name}
                          </Link>
                        </NavigationMenu.Link>
                        {region.children.length > 0 && (
                          <ul className="flex flex-wrap gap-x-3 gap-y-1">
                            {region.children.map((city) => (
                              <li key={city.key}>
                                <NavigationMenu.Link asChild>
                                  <Link
                                    href={{ pathname: "/destinations/[slug]", params: { slug: city.slug } }}
                                    className="text-small text-muted-foreground hover:text-foreground hover:underline hover:decoration-gold"
                                  >
                                    {city.name}
                                  </Link>
                                </NavigationMenu.Link>
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
                <NavigationMenu.Link asChild>
                  <Link
                    href="/destinations"
                    className="text-small font-medium underline decoration-gold underline-offset-[6px]"
                  >
                    {t("allDestinations")}
                  </Link>
                </NavigationMenu.Link>
              </div>
            </div>
          </NavigationMenu.Content>
        </NavigationMenu.Item>

        {rest.map((item) => (
          <NavigationMenu.Item key={item.key}>
            <NavigationMenu.Link asChild>
              <Link href={item.href} className={linkClass}>
                {t(item.key)}
              </Link>
            </NavigationMenu.Link>
          </NavigationMenu.Item>
        ))}
      </NavigationMenu.List>

      {/* Full-width panel under the header (the header is the positioning context). */}
      <div className="absolute inset-x-0 top-full">
        <NavigationMenu.Viewport className="w-full overflow-hidden border-b border-border bg-background text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 h-[var(--radix-navigation-menu-viewport-height)]" />
      </div>
    </NavigationMenu.Root>
  );
}
