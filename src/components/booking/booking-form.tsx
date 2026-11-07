"use client";

import "@/lib/zod-config";

import { zodResolver } from "@hookform/resolvers/zod";
import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { type FieldPath, useForm, useWatch } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateRange } from "@/lib/dates";
import { formatVnd } from "@/lib/money";
import { createBookingAction, quoteAction } from "@/modules/booking/checkout.actions";
import { type CheckoutDraftInput, checkoutDraftSchema } from "@/modules/booking/booking.schemas";
import type { BookingFormDeparture } from "@/modules/booking/checkout.service";
import type { Quote } from "@/modules/booking/pricing";

import { useTurnstile } from "@/components/forms/use-turnstile";

import { PriceSummary } from "./price-summary";

type Props = {
  locale: "vi" | "en";
  tour: { title: string; durationDays: number; durationNights: number; depositPercent: number; childAgeMax: number; infantAgeMax: number };
  departures: BookingFormDeparture[];
  initial: { departureId: string; adults: number; children: number };
  turnstileSiteKey: string | null;
  /** The payment page path with `{code}` for the booking code (functions cannot cross to the client). */
  checkoutPath: string;
  /** Published policy pages only; without terms the box accepts the privacy policy alone. */
  links: { terms: string | null; privacy: string };
  policy: React.ReactNode;
};

const STEPS = ["date", "contact", "confirm"] as const;
const STEP_FIELDS: Record<(typeof STEPS)[number], FieldPath<CheckoutDraftInput>[]> = {
  date: ["departureId", "party.adults", "party.children", "party.infants", "party.singleRooms"],
  contact: ["contact.name", "contact.email", "contact.phone", "contact.country", "contact.specialRequests"],
  confirm: ["plan", "invoice", "acceptTerms"],
};

function Stepper({ label, value, min, max, onChange, id }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; id: string }) {
  const t = useTranslations("Booking");
  return (
    <div className="flex items-center gap-2" role="group" aria-labelledby={id}>
      <Button type="button" variant="outline" size="icon" aria-label={t("decrease", { label })} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </Button>
      <output aria-live="polite" className="w-8 text-center text-body font-medium tabular-nums">
        {value}
      </output>
      <Button type="button" variant="outline" size="icon" aria-label={t("increase", { label })} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * Book-now flow (docs/specs/phase-4-booking-payments.md step 7): date and guests, contact, then
 * payment plan, invoice and terms. The price shown is the server's at every change; the draft
 * holds no seats until the customer chooses a payment method.
 */
export function BookingForm({ locale, tour, departures, initial, turnstileSiteKey, checkoutPath, links, policy }: Props) {
  const t = useTranslations("Booking");
  const errors = useTranslations("Booking.errors");
  const errorText = (key: string) => (errors.has(key) ? errors(key) : errors("invalid"));
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ids = { adults: useId(), children: useId(), infants: useId(), rooms: useId(), title: useId() };
  const [step, setStep] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [pricing, startPricing] = useTransition();
  const [invoice, setInvoice] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const turnstile = useTurnstile({ siteKey: turnstileSiteKey, locale, action: "booking", formRef });
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const form = useForm<CheckoutDraftInput>({
    resolver: zodResolver(checkoutDraftSchema, undefined, { raw: true }),
    defaultValues: {
      idempotencyKey,
      departureId: initial.departureId,
      locale,
      party: { adults: initial.adults, children: initial.children, infants: 0, singleRooms: 0 },
      plan: departures.find((departure) => departure.id === initial.departureId)?.plans[0] ?? "full",
      contact: { name: "", email: "", phone: "", country: "", specialRequests: "" },
      invoice: null,
      acceptTerms: false as unknown as true,
      marketing: false,
      turnstileToken: "",
    },
  });
  const departureId = useWatch({ control: form.control, name: "departureId" });
  const party = useWatch({ control: form.control, name: "party" });
  const plan = useWatch({ control: form.control, name: "plan" });
  const departure = departures.find((item) => item.id === departureId) ?? departures[0];

  // The plan must be one the departure offers (deposit only while the balance can still wait).
  useEffect(() => {
    if (departure && !departure.plans.includes(plan)) form.setValue("plan", departure.plans[0]);
  }, [departure, plan, form]);

  useEffect(() => {
    if (!departure) return;
    const handle = setTimeout(() => {
      startPricing(async () => {
        const result = await quoteAction({ departureId: departure.id, party, plan: departure.plans.includes(plan) ? plan : departure.plans[0] });
        if (result.ok) {
          setQuote(result.quote);
          setQuoteError(null);
        } else {
          setQuote(null);
          setQuoteError(errorText(result.error));
        }
      });
    }, 250);
    return () => clearTimeout(handle);
    // errorText is stable enough; re-quote only when the choices change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departure, party.adults, party.children, party.infants, party.singleRooms, plan]);

  // Focus follows a step change (never the first render, so the page loads at its top).
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) headingRef.current?.focus();
    previousStep.current = step;
  }, [step]);

  async function next() {
    const valid = await form.trigger(STEP_FIELDS[STEPS[step]]);
    if (!valid || (STEPS[step] === "date" && !quote)) return;
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  async function onSubmit(values: CheckoutDraftInput) {
    setAlert(null);
    // The widget puts its single-use token in the form (shared hook, ADR-035).
    const token = formRef.current ? String(new FormData(formRef.current).get("cf-turnstile-response") ?? "") : "";
    const result = await createBookingAction({ ...values, invoice: invoice ? values.invoice : null, turnstileToken: token });
    if (!result.ok) {
      turnstile.reset();
      if ("fields" in result && result.fields && Object.keys(result.fields).length > 0) {
        for (const [name, message] of Object.entries(result.fields)) {
          form.setError(name as FieldPath<CheckoutDraftInput>, { type: "server", message });
        }
        setAlert(errors("invalid"));
      } else {
        setAlert(errorText(result.error));
      }
      return;
    }
    router.push(checkoutPath.replace("{code}", encodeURIComponent(result.code)));
  }

  const current = STEPS[step];
  const maxGuests = departure ? departure.seatsLeft : 1;
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Form {...form}>
        <form
          ref={formRef}
          noValidate
          onSubmit={(event) => {
            // Turnstile first (it re-submits the form once its token arrives), then the form checks.
            turnstile.onSubmit(event);
            if (!event.defaultPrevented) void form.handleSubmit(onSubmit)(event);
          }}
          onFocus={turnstile.start}
          className="flex flex-col gap-8"
          aria-labelledby={ids.title}
        >
          <nav aria-label={t("steps.label")}>
            <ol className="flex flex-wrap gap-x-6 gap-y-2 text-small">
              {STEPS.map((name, index) => (
                <li key={name} aria-current={index === step ? "step" : undefined} className={index === step ? "font-semibold text-foreground" : "text-muted-foreground"}>
                  <span className="mr-2 tabular-nums">{index + 1}.</span>
                  {t(`steps.${name}`)}
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex flex-col gap-1">
            <p className="text-eyebrow font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t("steps.step", { current: step + 1, total: STEPS.length })}</p>
            <h2 id={ids.title} ref={headingRef} tabIndex={-1} className="font-serif text-h2 font-medium focus:outline-none lg:text-h2-lg">
              {t(`steps.${current}`)}
            </h2>
          </div>
          {alert && (
            <Alert variant="destructive" live="assertive">
              <AlertDescription>{alert}</AlertDescription>
            </Alert>
          )}

          {current === "date" && (
            <div className="flex flex-col gap-8">
              <FormField
                control={form.control}
                name="departureId"
                render={({ field }) => (
                  <FormItem>
                    <fieldset className="flex flex-col gap-3">
                      <legend className="mb-2 text-body font-semibold">{t("departure")}</legend>
                      {departures.map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                        >
                          <span className="flex items-center gap-3">
                            <input type="radio" name={field.name} value={item.id} checked={field.value === item.id} onChange={() => field.onChange(item.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                            <span className="flex flex-col">
                              <span className="font-medium">{formatDateRange(item.startDate, item.endDate, locale)}</span>
                              <span className="text-small text-muted-foreground">{t("seatsLeft", { count: item.seatsLeft })}</span>
                            </span>
                          </span>
                          <span className="text-right text-small">
                            <span className="font-medium tabular-nums">{formatVnd(item.priceAdult, locale)}</span> {t("perAdult")}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    <FormMessage formatMessage={errorText} />
                  </FormItem>
                )}
              />
              <div className="grid gap-6 sm:grid-cols-2">
                {(
                  [
                    ["adults", t("adults"), 1, maxGuests],
                    ["children", t("children", { age: tour.childAgeMax }), 0, maxGuests],
                    ["infants", t("infants", { age: tour.infantAgeMax + 1 }), 0, Math.floor(party.adults / 2)],
                    ["singleRooms", t("singleRooms"), 0, party.adults],
                  ] as const
                ).map(([name, label, min, max]) => {
                  const labelId = name === "singleRooms" ? ids.rooms : ids[name];
                  return (
                    <div key={name} className="flex items-center justify-between gap-4 border-b border-border pb-4">
                      <span id={labelId} className="text-body">
                        {label}
                      </span>
                      <Stepper id={labelId} label={label} value={party[name]} min={min} max={Math.max(min, max)} onChange={(value) => form.setValue(`party.${name}`, value, { shouldValidate: true })} />
                    </div>
                  );
                })}
              </div>
              <p className="text-small text-muted-foreground">{t("infantsHint")}</p>
              {quoteError && (
                <Alert variant="destructive" live="polite">
                  <AlertDescription>{quoteError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {current === "contact" && (
            <div className="grid gap-6 sm:grid-cols-2">
              {(
                [
                  ["contact.name", t("contactName"), "text", "name"],
                  ["contact.email", t("contactEmail"), "email", "email"],
                  ["contact.phone", t("contactPhone"), "tel", "tel"],
                  ["contact.country", t("contactCountry"), "text", "country-name"],
                ] as const
              ).map(([name, label, type, autoComplete]) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input type={type} autoComplete={autoComplete} {...field} value={(field.value as string | null) ?? ""} />
                      </FormControl>
                      <FormMessage formatMessage={errorText} />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="contact.specialRequests"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t("specialRequests")}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} maxLength={2000} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormDescription>{t("specialRequestsHint")}</FormDescription>
                    <FormMessage formatMessage={errorText} />
                  </FormItem>
                )}
              />
              <p className="text-small text-muted-foreground sm:col-span-2">{t("travellersLater")}</p>
            </div>
          )}

          {current === "confirm" && departure && (
            <div className="flex flex-col gap-8">
              <FormField
                control={form.control}
                name="plan"
                render={({ field }) => (
                  <FormItem>
                    <fieldset className="flex flex-col gap-3">
                      <legend className="mb-2 text-body font-semibold">{t("plan")}</legend>
                      {departure.plans.includes("deposit") ? (
                        (["deposit", "full"] as const).map((value) => (
                          <label key={value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                            <input type="radio" name={field.name} value={value} checked={field.value === value} onChange={() => field.onChange(value)} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" />
                            <span className="flex flex-col">
                              <span className="font-medium">{value === "deposit" ? t("planDeposit", { percent: tour.depositPercent }) : t("planFull")}</span>
                              {value === "deposit" && quote?.balanceDueDate && (
                                <span className="text-small text-muted-foreground">{t("planDepositHint", { date: formatDate(quote.balanceDueDate, locale) })}</span>
                              )}
                            </span>
                          </label>
                        ))
                      ) : (
                        <p className="text-small text-muted-foreground">{t("planFullOnly")}</p>
                      )}
                    </fieldset>
                    <FormMessage formatMessage={errorText} />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-3 text-body">
                  <Checkbox
                    checked={invoice}
                    onCheckedChange={(checked) => {
                      const on = checked === true;
                      setInvoice(on);
                      form.setValue("invoice", on ? { companyName: "", taxCode: "", address: "", email: "" } : null);
                    }}
                  />
                  {t("invoiceToggle")}
                </label>
                {invoice && (
                  <div className="grid gap-6 sm:grid-cols-2">
                    {(
                      [
                        ["invoice.companyName", t("invoiceCompany"), "organization"],
                        ["invoice.taxCode", t("invoiceTaxCode"), "off"],
                        ["invoice.address", t("invoiceAddress"), "street-address"],
                        ["invoice.email", t("invoiceEmail"), "email"],
                      ] as const
                    ).map(([name, label, autoComplete]) => (
                      <FormField
                        key={name}
                        control={form.control}
                        name={name}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{label}</FormLabel>
                            <FormControl>
                              <Input autoComplete={autoComplete} {...field} value={(field.value as string | undefined) ?? ""} />
                            </FormControl>
                            <FormMessage formatMessage={errorText} />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>

              {policy}

              <FormField
                control={form.control}
                name="acceptTerms"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start gap-3">
                      <FormControl>
                        <Checkbox checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked === true)} />
                      </FormControl>
                      <FormLabel className="font-normal leading-relaxed">
                        {links.terms ? t("acceptTerms") : t("acceptPrivacy")}{" "}
                        {links.terms && (
                          <>
                            <a href={links.terms} target="_blank" rel="noopener" className="underline underline-offset-4">
                              {t("termsLink")}
                            </a>
                            {" · "}
                          </>
                        )}
                        <a href={links.privacy} target="_blank" rel="noopener" className="underline underline-offset-4">
                          {t("privacyLink")}
                        </a>
                      </FormLabel>
                    </div>
                    <FormMessage formatMessage={errorText} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="marketing"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start gap-3">
                      <FormControl>
                        <Checkbox checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked === true)} />
                      </FormControl>
                      <FormLabel className="font-normal leading-relaxed">{t("marketing")}</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              <div ref={turnstile.widgetRef} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
            {step > 0 && (
              <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
                {t("back")}
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next} disabled={STEPS[step] === "date" && (!quote || pricing)}>
                {t("next")}
              </Button>
            ) : (
              <Button type="submit" size="lg" disabled={form.formState.isSubmitting || turnstile.waiting || !quote} aria-busy={form.formState.isSubmitting || turnstile.waiting}>
                {form.formState.isSubmitting || turnstile.waiting ? t("submitting") : t("submit")}
              </Button>
            )}
          </div>
        </form>
      </Form>

      <aside aria-labelledby={`${ids.title}-summary`} className="flex flex-col gap-4 self-start rounded-lg border border-border bg-card p-6 lg:sticky lg:top-24">
        <h2 id={`${ids.title}-summary`} className="font-serif text-h3 font-semibold">
          {t("summaryTitle")}
        </h2>
        <p className="text-body font-medium">{tour.title}</p>
        <p className="text-small text-muted-foreground">
          {t("nights", { days: tour.durationDays, nights: tour.durationNights })}
          {departure && ` · ${formatDateRange(departure.startDate, departure.endDate, locale)}`}
        </p>
        <PriceSummary quote={quote} locale={locale} pending={pricing} />
      </aside>
    </div>
  );
}
