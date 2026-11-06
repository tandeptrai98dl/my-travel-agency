"use client";

import { useTranslations } from "next-intl";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import { MoneyInput } from "@/components/admin/money-input";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import type { DeparturePrices } from "@/modules/catalog/departures/departures.schemas";

/** Departure messages first (`Admin.Departures.errors`), then the shared ones (`Admin.Taxonomy.errors`). */
export function useDepartureErrorText() {
  const own = useTranslations("Admin.Departures.errors");
  const shared = useTranslations("Admin.Taxonomy.errors");
  return (key: string) => (own.has(key) ? own(key) : shared.has(key) ? shared(key) : shared("invalid"));
}

export const PRICE_KEYS = ["priceAdult", "priceChild", "priceInfant", "singleSupplement"] as const;

/** A whole-number field: empty or unreadable text becomes NaN, so Zod reports it. */
export function CountField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  min,
  max,
}: {
  form: UseFormReturn<T, unknown, unknown>;
  name: Path<T>;
  label: string;
  hint?: string;
  min?: number;
  max?: number;
}) {
  const errorText = useDepartureErrorText();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              inputMode="numeric"
              step="1"
              min={min}
              max={max}
              ref={field.ref}
              name={field.name}
              onBlur={field.onBlur}
              value={field.value == null || Number.isNaN(field.value) ? "" : field.value}
              onChange={(event) => {
                const { value, validity } = event.target;
                field.onChange(validity.badInput || value === "" ? Number.NaN : Number(value));
              }}
            />
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage formatMessage={errorText} />
        </FormItem>
      )}
    />
  );
}

/** The four admin-only price fields (ADR-016), under `prices.*`. */
export function PriceFields<T extends FieldValues>({ form }: { form: UseFormReturn<T, unknown, unknown> }) {
  const t = useTranslations("Admin.Departures");
  const errorText = useDepartureErrorText();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PRICE_KEYS.map((key) => (
        <FormField
          key={key}
          control={form.control}
          name={`prices.${key}` as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t(`prices.${key}`)}</FormLabel>
              <FormControl>
                <MoneyInput
                  ref={field.ref}
                  name={field.name}
                  onBlur={field.onBlur}
                  value={typeof field.value === "number" && !Number.isNaN(field.value) ? field.value : null}
                  // The adult price is required: empty becomes NaN so Zod reports it.
                  onChange={(value) => field.onChange(value ?? (key === "priceAdult" ? Number.NaN : null))}
                />
              </FormControl>
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />
      ))}
    </div>
  );
}

/** Prices as text, for roles that cannot change them. */
export function PriceSummary({ prices }: { prices: DeparturePrices }) {
  const t = useTranslations("Admin.Departures");
  return (
    <dl className="grid gap-x-6 gap-y-2 text-small sm:grid-cols-2">
      {PRICE_KEYS.map((key) => (
        <div key={key} className="flex justify-between gap-4 border-b border-border py-1">
          <dt className="text-muted-foreground">{t(`prices.${key}`)}</dt>
          <dd className="tabular-nums">{prices[key] == null ? t("prices.none") : formatVnd(prices[key], "vi")}</dd>
        </div>
      ))}
    </dl>
  );
}
