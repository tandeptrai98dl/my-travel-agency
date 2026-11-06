"use client";

import { CalendarDays, FileClock, Images, LayoutDashboard, Map as MapIcon, MapPinned, Menu, Palette, ScrollText, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { type AdminNavIcon, isActive } from "./nav-items";

export type VisibleNavGroup = { label: string; items: { href: string; label: string; icon: AdminNavIcon }[] };

const ICONS = {
  dashboard: LayoutDashboard,
  audit: FileClock,
  design: Palette,
  media: Images,
  destinations: MapPinned,
  styles: Sparkles,
  policies: ScrollText,
  tours: MapIcon,
  departures: CalendarDays,
} as const;

type Props = {
  groups: VisibleNavGroup[];
  labels: { nav: string; openMenu: string; closeMenu: string };
};

function NavList({ groups, onNavigate }: { groups: VisibleNavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          <p className="px-3 text-eyebrow font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {group.label}
          </p>
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(item.href, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-md px-3 text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Desktop sidebar (lg and up). */
export function AdminSidebar({ groups, label }: { groups: VisibleNavGroup[]; label: string }) {
  return (
    <nav aria-label={label} className="hidden w-64 shrink-0 border-r border-border bg-card px-4 py-8 lg:block">
      <NavList groups={groups} />
    </nav>
  );
}

/** The same menu in a sheet below lg; focus returns to the menu button on close. */
export function AdminMobileNav({ groups, labels }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label={labels.openMenu}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu strokeWidth={1.5} aria-hidden="true" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          closeLabel={labels.closeMenu}
          aria-describedby={undefined}
          // No Radix trigger: return focus to the menu button ourselves (WCAG 2.4.3), or to the
          // page content when the button is hidden (window widened to lg while open).
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const button = buttonRef.current;
            if (button?.isConnected && button.offsetParent !== null) button.focus();
            else document.getElementById("admin-main")?.focus({ preventScroll: true });
          }}
        >
          <SheetTitle className="sr-only">{labels.nav}</SheetTitle>
          <nav aria-label={labels.nav} className="mt-10">
            <NavList groups={groups} onNavigate={() => setOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
