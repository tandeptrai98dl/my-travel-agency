"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";
import type { DestinationNode } from "@/modules/catalog/destinations";

import { LanguageSwitcher } from "./language-switcher";
import { PRIMARY_NAV } from "./nav-items";

type Props = { destinations: DestinationNode[]; className?: string };

/** Navigation for small screens: a sheet with a focus trap, closed by Escape or any link. */
export function MobileNav({ destinations, className }: Props) {
  const t = useTranslations("Navigation");
  const [open, setOpen] = useState(false);
  const [tours, ...rest] = PRIMARY_NAV;
  const itemClass = "flex min-h-11 items-center border-b border-border py-3 text-body-lg font-medium";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label={t("openMenu")}>
          <Menu strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={t("closeMenu")} aria-describedby={undefined}>
        <SheetTitle className="sr-only">{t("menuTitle")}</SheetTitle>
        <nav aria-label={t("primary")} className="mt-10 flex flex-col">
          <SheetClose asChild>
            <Link href={tours.href} className={itemClass}>
              {t(tours.key)}
            </Link>
          </SheetClose>
          <Accordion type="single" collapsible>
            <AccordionItem value="destinations">
              <AccordionTrigger className="text-body-lg">{t("destinations")}</AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col gap-1">
                  {destinations.map((country) => (
                    <li key={country.key}>
                      <SheetClose asChild>
                        <Link
                          href={{ pathname: "/destinations/[slug]", params: { slug: country.slug } }}
                          className="flex min-h-11 items-center text-body"
                        >
                          {country.name}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                  <li>
                    <SheetClose asChild>
                      <Link
                        href="/destinations"
                        className="flex min-h-11 items-center text-body underline decoration-gold underline-offset-[6px]"
                      >
                        {t("allDestinations")}
                      </Link>
                    </SheetClose>
                  </li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          {rest.map((item) => (
            <SheetClose asChild key={item.key}>
              <Link href={item.href} className={itemClass}>
                {t(item.key)}
              </Link>
            </SheetClose>
          ))}
        </nav>
        <LanguageSwitcher className="mt-auto pt-6" />
      </SheetContent>
    </Sheet>
  );
}
