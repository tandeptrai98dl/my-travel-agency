import { features } from "@/lib/features";

/** Primary navigation (internal paths; next-intl localizes them). Destinations has a mega menu. */
export const PRIMARY_NAV = [
  { key: "tours", href: "/tours" },
  // The tailor-made wizard is Phase 5; until then the item opens the contact page (decision 9).
  { key: "tailorMade", href: features.inquiry ? "/tailor-made" : "/contact" },
  { key: "journal", href: "/journal" },
  { key: "about", href: "/about" },
  { key: "contact", href: "/contact" },
] as const;

export type PrimaryNavKey = (typeof PRIMARY_NAV)[number]["key"];

/** Routes whose first section is a full-bleed navy hero: the header sits on top of it. */
export const OVERLAY_HEADER_ROUTES = new Set<string>(["/"]);
