import { formatVnd } from "@/lib/money";
import type { Locale } from "@/modules/catalog/public/types";

type Props = {
  tiers: { minPax: number; maxPax: number; pricePerAdult: number }[];
  locale: Locale;
  labels: { range: (min: number, max: number) => string; perAdult: string; note: string };
};

/** Indicative private-tour prices by group size. */
export function PriceTiers({ tiers, locale, labels }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-border border-y border-border">
        {tiers.map((tier) => (
          <li key={`${tier.minPax}-${tier.maxPax}`} className="flex items-baseline justify-between gap-4 py-4">
            <span className="text-body">{labels.range(tier.minPax, tier.maxPax)}</span>
            <span className="tabular-nums">
              <span className="font-semibold">{formatVnd(tier.pricePerAdult, locale)}</span>{" "}
              <span className="text-small text-muted-foreground">{labels.perAdult}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-small text-muted-foreground">{labels.note}</p>
    </div>
  );
}
