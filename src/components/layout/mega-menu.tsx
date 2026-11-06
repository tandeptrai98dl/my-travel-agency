"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { DestinationNode } from "@/modules/catalog/destinations";

import { useLabels } from "./labels";
import { PRIMARY_NAV } from "./nav-items";

type Props = { destinations: DestinationNode[]; className?: string };

const linkClass =
  "inline-flex h-11 items-center gap-1 rounded-md px-3 text-small font-medium tracking-wide underline-offset-[10px] decoration-gold decoration-1 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Desktop navigation with the destinations panel (countries → regions → cities), built as a
 * disclosure: a button that shows and hides a panel of links (WAI-ARIA disclosure navigation).
 * No menu library, so the header adds almost no JavaScript (Phase 3 spec decision 16). The panel
 * follows its button in the DOM, so Tab moves into it; Escape, a click outside or focus leaving
 * the navigation closes it.
 */
export function MegaMenu({ destinations, className }: Props) {
  const t = useLabels("Navigation");
  const [tours, ...rest] = PRIMARY_NAV;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const navRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Hover opens and closes the panel for mouse users, with a short grace period to cross the gap.
  const hoverOpen = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  return (
    <nav
      ref={navRef}
      aria-label={t("primary")}
      className={cn("static", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close(true);
        }
      }}
      onBlur={(event) => {
        if (open && !navRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <ul className="flex items-center gap-1">
        <li>
          <Link href={tours.href} className={linkClass}>
            {t(tours.key)}
          </Link>
        </li>
        <li onPointerEnter={hoverOpen} onPointerLeave={hoverClose}>
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            className={cn(linkClass, "group", open && "underline")}
            onClick={() => setOpen((value) => !value)}
          >
            {t("destinations")}
            <ChevronDown
              className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
          {/* Full-width panel under the header (the header is the positioning context). */}
          <div
            id={panelId}
            hidden={!open}
            className="absolute inset-x-0 top-full border-b border-border bg-background text-foreground"
          >
            <div className="mx-auto grid max-w-7xl gap-10 px-8 py-10 md:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
              {destinations.map((country) => (
                <div key={country.key} className="flex flex-col gap-4">
                  <Link
                    href={{ pathname: "/destinations/[slug]", params: { slug: country.slug } }}
                    className="font-serif text-h3 font-semibold hover:underline hover:decoration-gold"
                  >
                    {country.name}
                  </Link>
                  <ul className="flex flex-col gap-3">
                    {country.children.map((region) => (
                      <li key={region.key} className="flex flex-col gap-1.5">
                        <Link
                          href={{ pathname: "/destinations/[slug]", params: { slug: region.slug } }}
                          className="text-small font-semibold hover:underline hover:decoration-gold"
                        >
                          {region.name}
                        </Link>
                        {region.children.length > 0 && (
                          <ul className="flex flex-wrap gap-x-3 gap-y-1">
                            {region.children.map((city) => (
                              <li key={city.key}>
                                <Link
                                  href={{ pathname: "/destinations/[slug]", params: { slug: city.slug } }}
                                  className="text-small text-muted-foreground hover:text-foreground hover:underline hover:decoration-gold"
                                >
                                  {city.name}
                                </Link>
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
                <Link href="/destinations" className="text-small font-medium underline decoration-gold underline-offset-[6px]">
                  {t("allDestinations")}
                </Link>
              </div>
            </div>
          </div>
        </li>
        {rest.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className={linkClass}>
              {t(item.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
