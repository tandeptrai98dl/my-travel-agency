"use client";

import { Menu } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { DestinationNode } from "@/modules/catalog/destinations";

// The sheet (Radix dialog + accordion) loads on first open, keeping it out of the initial JS
// on public pages (ARCHITECTURE.md "Performance": < 150 KB gzip).
const MobileNavSheet = dynamic(() => import("./mobile-nav-sheet"), { ssr: false });

type Props = { destinations: DestinationNode[]; className?: string };

/** Menu button for small screens; opens the navigation sheet. */
export function MobileNav({ destinations, className }: Props) {
  const t = useTranslations("Navigation");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={className}
        aria-label={t("openMenu")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
      >
        <Menu strokeWidth={1.5} aria-hidden="true" />
      </Button>
      {loaded && <MobileNavSheet destinations={destinations} open={open} onOpenChange={setOpen} />}
    </>
  );
}
