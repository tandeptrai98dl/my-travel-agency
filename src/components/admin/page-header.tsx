import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type Crumb = { label: string; href?: string };

type Props = {
  title: string;
  description?: string;
  /** Usually one primary button (DESIGN_SYSTEM.md "one primary action per screen"). */
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
  breadcrumbLabel?: string;
  className?: string;
};

/** Title row of every admin page: breadcrumbs, the page's only h1, description and actions. */
export function PageHeader({ title, description, actions, breadcrumbs, breadcrumbLabel, className }: Props) {
  return (
    <div className={cn("flex flex-col gap-4 border-b border-border pb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label={breadcrumbLabel}>
          <ol className="flex flex-wrap items-center gap-1 text-small text-muted-foreground">
            {breadcrumbs.map((crumb, index) => {
              const last = index === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {crumb.href && !last ? (
                    <Link href={crumb.href} className="hover:text-foreground hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
                  )}
                  {!last && <ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-h2 font-medium">{title}</h1>
          {description && <p className="max-w-2xl text-small text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
