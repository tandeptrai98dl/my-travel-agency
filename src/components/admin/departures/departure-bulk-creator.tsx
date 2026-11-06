"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createDeparturesAction,
  departureDefaultsAction,
  previewDeparturesAction,
} from "@/modules/catalog/departures/departures.actions";
import {
  type DeparturePlanInput,
  departurePlanSchema,
  type DeparturePrices,
  MAX_CAPACITY,
  NEW_DEPARTURE_STATUSES,
} from "@/modules/catalog/departures/departures.schemas";
import type { DeparturePreview, TourOption } from "@/modules/catalog/departures/departures.service";

import { CountField, PriceFields, PriceSummary, useDepartureErrorText } from "./departure-fields";

/** Monday first, as `Date.getUTCDay()` numbers. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_KEYS = { 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 0: "sun" } as const;

type Defaults = { tour: TourOption; latestPrices: DeparturePrices | null };
type Failure = { ok: false; error: string; field?: string; fields?: Record<string, string>; invalid?: string[] };

const emptyPrices = { priceAdult: Number.NaN, priceChild: null, priceInfant: null, singleSupplement: null };

type Props = {
  /** Group tours that are not archived. */
  tours: TourOption[];
  initialTourId?: string;
  /** Admin at aal2 (ADR-016); everyone else gets the latest departure's prices. */
  canEditPrices: boolean;
};

/**
 * Bulk creation of departures (spec Phase 2 step 15): a weekday pattern within a range or a list
 * of dates, a preview that marks dates the tour already has, then one save.
 */
export function DepartureBulkCreator({ tours, initialTourId, canEditPrices }: Props) {
  const t = useTranslations("Admin.Departures");
  const format = useFormatter();
  const errorText = useDepartureErrorText();
  const id = useId();
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [preview, setPreview] = useState<{ key: string; values: DeparturePlanInput; result: DeparturePreview } | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [done, setDone] = useState<{ tourId: string; created: number; skipped: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<DeparturePlanInput>({
    resolver: zodResolver(departurePlanSchema, undefined, { raw: true }),
    defaultValues: {
      tourId: initialTourId ?? "",
      mode: "weekly",
      from: "",
      to: "",
      weekdays: [],
      dates: "",
      capacity: tours.find((tour) => tour.id === initialTourId)?.maxPax ?? 16,
      status: "open",
      note: "",
      prices: canEditPrices ? emptyPrices : null,
    },
  });
  const tourId = form.watch("tourId");
  const mode = form.watch("mode");
  const current = JSON.stringify(form.watch());
  const fresh = preview && preview.key === current ? preview.result : null;

  // Load the tour's duration and the prices to copy whenever the tour changes.
  useEffect(() => {
    if (!tourId) return;
    let live = true;
    void departureDefaultsAction({ tourId }).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setDefaults(null);
        form.setError("tourId", { type: "server", message: (result as Failure).error });
        return;
      }
      const loaded = result as Defaults & { ok: true };
      setDefaults({ tour: loaded.tour, latestPrices: loaded.latestPrices });
      if (!form.getFieldState("capacity").isDirty && loaded.tour.maxPax) {
        form.setValue("capacity", loaded.tour.maxPax);
      }
      if (canEditPrices) form.setValue("prices", loaded.latestPrices ?? emptyPrices);
    });
    return () => {
      live = false;
    };
  }, [tourId, canEditPrices, form]);

  function showFailure(result: Failure) {
    const fields = { ...result.fields, ...(result.field ? { [result.field]: result.error } : {}) };
    for (const [name, message] of Object.entries(fields)) {
      form.setError(name as Parameters<typeof form.setError>[0], { type: "server", message });
    }
    const detail = result.invalid?.length ? ` ${result.invalid.join(", ")}` : "";
    setAlert(Object.keys(fields).length ? `${t("errors.fixFields")}${detail}` : errorText(result.error));
  }

  async function onPreview(values: DeparturePlanInput) {
    setAlert(null);
    setDone(null);
    const result = await previewDeparturesAction(values);
    if (!result.ok) {
      setPreview(null);
      showFailure(result as Failure);
      return;
    }
    setPreview({ key: JSON.stringify(values), values, result: result as DeparturePreview });
    requestAnimationFrame(() => previewHeading.current?.focus());
  }

  async function onCreate() {
    if (!preview) return;
    setSaving(true);
    setAlert(null);
    try {
      const result = await createDeparturesAction(preview.values);
      if (!result.ok) {
        showFailure(result as Failure);
        return;
      }
      const created = result as { tourId: string; created: string[]; skipped: string[] };
      setDone({ tourId: created.tourId, created: created.created.length, skipped: created.skipped.length });
      setPreview(null);
    } finally {
      setSaving(false);
    }
  }

  const date = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00`), { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const newCount = fresh ? fresh.rows.filter((row) => !row.exists).length : 0;

  return (
    <div className="flex max-w-4xl flex-col gap-10">
      <Form {...form}>
        <form
          noValidate
          onSubmit={form.handleSubmit(onPreview, () => {
            setAlert(null);
            requestAnimationFrame(() => setAlert(t("errors.fixFields")));
          })}
          className="flex flex-col gap-8"
        >
          {alert && (
            <Alert variant="destructive" live="assertive">
              <AlertDescription>{alert}</AlertDescription>
            </Alert>
          )}
          {done && (
            <Alert variant="success" live="polite">
              <AlertDescription className="flex flex-col gap-2">
                <span>{t("created", { created: done.created, skipped: done.skipped })}</span>
                <Link href={`/admin/departures?tour=${done.tourId}`} className="font-medium underline underline-offset-4">
                  {t("viewCreated")}
                </Link>
              </AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="tourId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("tour")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger ref={field.ref}>
                      <SelectValue placeholder={t("chooseTour")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {tours.map((tour) => (
                      <SelectItem key={tour.id} value={tour.id}>
                        {tour.code} · {tour.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {defaults && <FormDescription>{t("durationHint", { days: defaults.tour.durationDays })}</FormDescription>}
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mode"
            render={({ field }) => (
              <FormItem>
                <p id={`${id}-mode`} className="text-small font-medium leading-none">
                  {t("mode")}
                </p>
                <FormControl>
                  <RadioGroup aria-labelledby={`${id}-mode`} value={field.value} onValueChange={field.onChange} className="flex flex-wrap gap-6">
                    {(["weekly", "dates"] as const).map((value) => (
                      <div key={value} className="flex items-center gap-2">
                        <RadioGroupItem value={value} id={`${id}-mode-${value}`} />
                        <Label htmlFor={`${id}-mode-${value}`}>{t(`modes.${value}`)}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </FormControl>
              </FormItem>
            )}
          />

          {mode === "weekly" ? (
            <div className="grid gap-6 md:grid-cols-2">
              {(["from", "to"] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t(name)}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage formatMessage={errorText} />
                    </FormItem>
                  )}
                />
              ))}
              <Controller
                control={form.control}
                name="weekdays"
                render={({ field, fieldState }) => (
                  <fieldset
                    className="flex flex-col gap-3 md:col-span-2"
                    aria-describedby={fieldState.error ? `${id}-weekdays-error` : undefined}
                  >
                    <legend className="mb-3 text-small font-medium">{t("weekdaysLegend")}</legend>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      {WEEKDAYS.map((day) => {
                        const checkboxId = `${id}-weekday-${day}`;
                        return (
                          <div key={day} className="flex items-center gap-2">
                            <Checkbox
                              id={checkboxId}
                              checked={field.value.includes(day)}
                              onCheckedChange={(next) =>
                                field.onChange(next ? [...field.value, day] : field.value.filter((value) => value !== day))
                              }
                            />
                            <Label htmlFor={checkboxId} className="font-normal">
                              {t(`weekdays.${WEEKDAY_KEYS[day]}`)}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                    <p id={`${id}-weekdays-error`} className="text-small font-medium text-destructive" aria-live="polite">
                      {fieldState.error?.message ? errorText(fieldState.error.message) : null}
                    </p>
                  </fieldset>
                )}
              />
            </div>
          ) : (
            <FormField
              control={form.control}
              name="dates"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dates")}</FormLabel>
                  <FormControl>
                    <Textarea rows={6} spellCheck={false} {...field} />
                  </FormControl>
                  <FormDescription>{t("datesHint")}</FormDescription>
                  <FormMessage formatMessage={errorText} />
                </FormItem>
              )}
            />
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <CountField form={form} name="capacity" label={t("capacity")} hint={t("capacityHint")} min={1} max={MAX_CAPACITY} />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("initialStatus")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger ref={field.ref}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NEW_DEPARTURE_STATUSES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`statuses.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("note")}</FormLabel>
                <FormControl>
                  <Textarea rows={2} maxLength={500} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormDescription>{t("noteHint")}</FormDescription>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />

          <section aria-labelledby={`${id}-prices`} className="flex flex-col gap-4 border-t border-border pt-8">
            <h2 id={`${id}-prices`} className="font-serif text-h3 font-semibold">
              {t("pricesTitle")}
            </h2>
            {canEditPrices ? (
              <>
                <p className="text-small text-muted-foreground">
                  {defaults?.latestPrices ? t("pricesPrefilled") : t("pricesFirst")}
                </p>
                <PriceFields form={form} />
              </>
            ) : defaults?.latestPrices ? (
              <>
                <p className="text-small text-muted-foreground">{t("pricesCopied")}</p>
                <PriceSummary prices={defaults.latestPrices} />
              </>
            ) : (
              <p className="text-small text-muted-foreground">{defaults ? t("errors.firstNeedsAdmin") : t("pricesChooseTour")}</p>
            )}
          </section>

          <div>
            <Button type="submit" variant="outline" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
              {t("preview")}
            </Button>
          </div>
        </form>
      </Form>

      {preview && !fresh && <p className="text-small text-muted-foreground">{t("previewStale")}</p>}
      {fresh && (
        <section aria-labelledby={`${id}-preview`} className="flex flex-col gap-4 border-t border-border pt-8">
          <h2 id={`${id}-preview`} ref={previewHeading} tabIndex={-1} className="font-serif text-h3 font-semibold focus:outline-none">
            {t("previewTitle", { code: fresh.tour.code })}
          </h2>
          <p>{t("previewSummary", { created: newCount, skipped: fresh.rows.length - newCount })}</p>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-small">
              <caption className="sr-only">{t("previewTitle", { code: fresh.tour.code })}</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-4 py-3 font-semibold">{t("columns.start")}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t("columns.end")}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t("columns.result")}</th>
                </tr>
              </thead>
              <tbody>
                {fresh.rows.map((row) => (
                  <tr key={row.startDate} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-2">
                      <time dateTime={row.startDate}>{date(row.startDate)}</time>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <time dateTime={row.endDate}>{date(row.endDate)}</time>
                    </td>
                    <td className="px-4 py-2">
                      {row.exists ? <span className="text-muted-foreground">{t("exists")}</span> : t("willCreate")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-small text-muted-foreground">
              {fresh.priceSource === "latest" ? t("pricesCopied") : t("pricesEntered")}
            </p>
            <PriceSummary prices={fresh.prices} />
          </div>
          <div>
            <Button type="button" onClick={onCreate} disabled={saving || newCount === 0} aria-busy={saving}>
              {t("createCount", { count: newCount })}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
