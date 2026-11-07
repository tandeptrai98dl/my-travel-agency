import type { Permission } from "@/lib/auth/permissions";

/** Icons are named, not imported, so this list stays importable from server and client code. */
export type AdminNavIcon = "dashboard" | "audit" | "design" | "media" | "destinations" | "styles" | "policies" | "tours" | "departures" | "journal" | "pages" | "reviews" | "redirects" | "subscribers" | "settings" | "staff" | "bookings" | "payments" | "inquiries" | "customers";

export type AdminNavItem = {
  href: string;
  /** Key in the `Admin.Nav` messages. */
  labelKey: "dashboard" | "auditLog" | "designSystem" | "media" | "destinations" | "travelStyles" | "policies" | "tours" | "departures" | "journal" | "pages" | "reviews" | "redirects" | "subscribers" | "settings" | "staff" | "bookings" | "payments" | "inquiries" | "customers";
  icon: AdminNavIcon;
  /** Shown only to roles holding it; the page and its actions check it again on the server. */
  permission: Permission;
  /** Only in development (or when SHOW_DESIGN_SYSTEM is set). */
  devOnly?: boolean;
};

export type AdminNavGroup = {
  labelKey: "groupGeneral" | "groupSales" | "groupCatalog" | "groupContent" | "groupSystem";
  items: AdminNavItem[];
};

// Sections are added here as their pages land (Phase 2 PRs B–G), so the menu never links to a
// page that does not exist yet.
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    labelKey: "groupGeneral",
    items: [{ href: "/admin", labelKey: "dashboard", icon: "dashboard", permission: "dashboard.view" }],
  },
  {
    labelKey: "groupSales",
    items: [
      { href: "/admin/inquiries", labelKey: "inquiries", icon: "inquiries", permission: "inquiries.read" },
      { href: "/admin/bookings", labelKey: "bookings", icon: "bookings", permission: "bookings.read" },
      { href: "/admin/payments", labelKey: "payments", icon: "payments", permission: "payments.read" },
      { href: "/admin/customers", labelKey: "customers", icon: "customers", permission: "customers.read" },
    ],
  },
  {
    labelKey: "groupCatalog",
    items: [
      { href: "/admin/tours", labelKey: "tours", icon: "tours", permission: "tours.read" },
      { href: "/admin/departures", labelKey: "departures", icon: "departures", permission: "tours.read" },
      { href: "/admin/destinations", labelKey: "destinations", icon: "destinations", permission: "content.manage" },
      { href: "/admin/travel-styles", labelKey: "travelStyles", icon: "styles", permission: "content.manage" },
      { href: "/admin/cancellation-policies", labelKey: "policies", icon: "policies", permission: "settings.manage" },
    ],
  },
  {
    labelKey: "groupContent",
    items: [
      { href: "/admin/journal", labelKey: "journal", icon: "journal", permission: "content.manage" },
      { href: "/admin/pages", labelKey: "pages", icon: "pages", permission: "content.manage" },
      { href: "/admin/reviews", labelKey: "reviews", icon: "reviews", permission: "content.manage" },
      { href: "/admin/media", labelKey: "media", icon: "media", permission: "media.manage" },
      { href: "/admin/redirects", labelKey: "redirects", icon: "redirects", permission: "redirects.manage" },
      { href: "/admin/subscribers", labelKey: "subscribers", icon: "subscribers", permission: "newsletter.manage" },
    ],
  },
  {
    labelKey: "groupSystem",
    items: [
      { href: "/admin/settings", labelKey: "settings", icon: "settings", permission: "settings.manage" },
      { href: "/admin/staff", labelKey: "staff", icon: "staff", permission: "staff.manage" },
      { href: "/admin/audit-log", labelKey: "auditLog", icon: "audit", permission: "audit.read" },
      {
        href: "/admin/design-system",
        labelKey: "designSystem",
        icon: "design",
        permission: "dashboard.view",
        devOnly: true,
      },
    ],
  },
];

/** Whether `pathname` is the item's page or one of its sub-pages (/admin only matches itself). */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
