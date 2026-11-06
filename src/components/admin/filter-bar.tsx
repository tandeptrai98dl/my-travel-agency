import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SelectFilter = {
  name: string;
  label: string;
  value?: string;
  /** First option is "all" (empty value). */
  allLabel: string;
  options: { value: string; label: string }[];
};

type Props = {
  action: string;
  search?: { label: string; value: string; placeholder?: string };
  selects?: SelectFilter[];
  /** Sort params to keep when filtering (filters reset the page). */
  hidden?: Record<string, string | undefined>;
  labels: { apply: string; clear: string };
  active: boolean;
  className?: string;
};

const selectClass =
  "h-11 rounded-md border border-input bg-card px-3 text-small text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Filters as a plain GET form: it works without JavaScript, the result is a shareable URL, and
 * the server validates every value again (`parseListParams`).
 */
export function FilterBar({ action, search, selects = [], hidden = {}, labels, active, className }: Props) {
  return (
    <form method="get" action={action} role="search" className={cn("flex flex-wrap items-end gap-3", className)}>
      {Object.entries(hidden).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      {search && (
        <div className="flex min-w-56 flex-1 flex-col gap-2">
          <Label htmlFor="filter-q">{search.label}</Label>
          <Input id="filter-q" name="q" type="search" defaultValue={search.value} placeholder={search.placeholder} />
        </div>
      )}
      {selects.map((select) => (
        <div key={select.name} className="flex flex-col gap-2">
          <Label htmlFor={`filter-${select.name}`}>{select.label}</Label>
          <select
            id={`filter-${select.name}`}
            name={select.name}
            defaultValue={select.value ?? ""}
            className={selectClass}
          >
            <option value="">{select.allLabel}</option>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <Button type="submit" variant="outline">
        {labels.apply}
      </Button>
      {active && (
        <Button asChild variant="ghost">
          <Link href={action}>{labels.clear}</Link>
        </Button>
      )}
    </form>
  );
}
