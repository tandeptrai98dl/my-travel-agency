"use client";


import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { DestinationNode } from "@/modules/catalog/destinations";

import { LanguageSwitcher } from "./language-switcher";
import { PRIMARY_NAV } from "./nav-items";
import { useLabels } from "./labels";
import { LocaleLink as Link } from "./locale-link";

type Props = {
  destinations: DestinationNode[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: React.RefObject<HTMLElement | null>;
};

/** The mobile menu sheet: focus trap, closed by Escape or any link. Loaded on first open. */
export default function MobileNavSheet({ destinations, open, onOpenChange, returnFocusTo }: Props) {
  const t = useLabels("Navigation");
  const [tours, ...rest] = PRIMARY_NAV;
  const itemClass = "flex min-h-11 items-center border-b border-border py-3 text-body-lg font-medium";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t("closeMenu")}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const button = returnFocusTo.current;
          // Resized to desktop while open: the menu button is hidden, continue from the content.
          if (button?.isConnected && button.offsetParent !== null) button.focus();
          else document.getElementById("main")?.focus({ preventScroll: true });
        }}
      >
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
        <LanguageSwitcher className="mt-auto pt-6" landmark={false} />
      </SheetContent>
    </Sheet>
  );
}
