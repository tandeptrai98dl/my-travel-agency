/** Primary navigation (internal paths; next-intl localizes them). Destinations has a mega menu. */
export const PRIMARY_NAV = [
  { key: "tours", href: "/tours" },
  { key: "tailorMade", href: "/tailor-made" },
  { key: "journal", href: "/journal" },
  { key: "about", href: "/about" },
  { key: "contact", href: "/contact" },
] as const;

export type PrimaryNavKey = (typeof PRIMARY_NAV)[number]["key"];

/** Routes whose first section is a full-bleed navy hero: the header sits on top of it. */
export const OVERLAY_HEADER_ROUTES = new Set<string>(["/"]);
