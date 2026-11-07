"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { internalRoute, splitLocale } from "@/i18n/paths";
import { cx } from "@/lib/cx";
import type { DestinationNode } from "@/modules/catalog/destinations";

import { LanguageSwitcher } from "./language-switcher";
import { MobileNav } from "./mobile-nav";
import { OVERLAY_HEADER_ROUTES } from "./nav-items";
import { useLabels } from "./labels";
import { LocaleLink as Link } from "./locale-link";

type Props = {
  brandName: string;
  destinations: DestinationNode[];
  /** The desktop navigation, rendered on the server (`DesktopNav`). */
  desktopNav: React.ReactNode;
};

/**
 * Site header: transparent over a navy hero (home), solid ivory elsewhere and once the page
 * scrolls. Desktop shows the mega menu; small screens get the mobile sheet.
 */
export function SiteHeader({ brandName, destinations, desktopNav }: Props) {
  const t = useLabels("Navigation");
  const { locale, path } = splitLocale(usePathname());
  const overlay = OVERLAY_HEADER_ROUTES.has(internalRoute(locale, path).pathname);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const transparent = overlay && !scrolled;

  return (
    <header
      className={cx(
        "inset-x-0 top-0 z-40 transition-colors duration-400 ease-luxe",
        overlay ? "fixed" : "sticky",
        transparent
          ? "theme-navy bg-transparent"
          : "border-b border-border bg-background/95 text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/85",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 md:h-20 md:px-8">
        <Link
          href="/"
          className="font-serif text-h4 font-semibold tracking-wide md:text-h3"
          aria-label={`${brandName} — ${t("home")}`}
        >
          {brandName}
        </Link>
        {desktopNav}
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <LanguageSwitcher />
          </div>
          <MobileNav destinations={destinations} className="lg:hidden" />
        </div>
      </div>
    </header>
  );
}
