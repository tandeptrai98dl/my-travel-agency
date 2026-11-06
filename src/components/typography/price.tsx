import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";

type Props = {
  amount: number;
  locale: "vi" | "en";
  /** Optional label before the amount, e.g. "From" / "Từ", passed in already translated. */
  prefix?: string;
  /** Optional unit after the amount, e.g. "/ person" / "/ khách". */
  suffix?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** A VND price, always in full with no rounding to "millions" (brief §6: state prices clearly). */
export function Price({ amount, locale, prefix, suffix, size = "md", className }: Props) {
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      {prefix && <span className="text-small text-muted-foreground">{prefix}</span>}
      <span
        className={cn(
          "font-semibold tabular-nums text-foreground",
          size === "sm" && "text-body",
          size === "md" && "text-h4 md:text-h4-lg",
          size === "lg" && "font-serif text-h2 font-medium md:text-h2-lg",
        )}
      >
        {formatVnd(amount, locale)}
      </span>
      {suffix && <span className="text-small text-muted-foreground">{suffix}</span>}
    </span>
  );
}
