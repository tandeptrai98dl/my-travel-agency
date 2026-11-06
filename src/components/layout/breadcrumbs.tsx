import NextLink from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { siteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

export type Crumb = {
  label: string;
  /** Localized path (from `getPathname`); the last crumb is the current page and has none. */
  href?: string;
};

type Props = {
  items: Crumb[];
  /** Accessible name of the trail, e.g. "Breadcrumb" / "Đường dẫn". */
  label: string;
  /** Absolute URL of the current page, for the last BreadcrumbList item. */
  currentUrl: string;
  /** Off for staff previews, which must not carry structured data. */
  withJsonLd?: boolean;
  className?: string;
};

/** Visible trail plus its `BreadcrumbList` (Phase 3 spec decision 10). */
export function Breadcrumbs({ items, label, currentUrl, withJsonLd = true, className }: Props) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? new URL(item.href, siteUrl).toString() : currentUrl,
    })),
  };

  return (
    <nav aria-label={label} className={cn("text-small text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <NextLink
                href={item.href}
                className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </NextLink>
            ) : (
              <span aria-current="page" className="text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
      {withJsonLd && <JsonLd data={jsonLd} />}
    </nav>
  );
}
