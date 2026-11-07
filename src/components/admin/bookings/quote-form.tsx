"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type FieldPath, useForm, useWatch } from "react-hook-form";

import { MoneyInput } from "@/components/admin/money-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { createQuoteAction } from "@/modules/booking/quote.actions";
import { type CreateQuoteInput, createQuoteSchema } from "@/modules/booking/quote.schemas";

import { selectClass } from "./fields";
import { useBookingErrorText } from "./use-booking-error-text";

type TourOption = { id: string; code: string; type: "group" | "private"; title: string };

/** A private-trip quote from sales (spec Phase 4 step 13): final prices per guest and an expiry. */
export function QuoteForm({ tours, defaultDate }: { tours: TourOption[]; defaultDate: string }) {
  const t = useTranslations("Admin.Quote");
  const errorText = useBookingErrorText();
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<CreateQuoteInput>({
    resolver: zodResolver(createQuoteSchema, undefined, { raw: true }),
    defaultValues: {
      tourId: tours.find((tour) => tour.type === "private")?.id ?? "",
      startDate: defaultDate,
      locale: "vi",
      adults: 2,
      children: 0,
      infants: 0,
      priceAdult: null as unknown as number,
      priceChild: null,
      plan: "deposit",
      validDays: 7,
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      specialRequests: "",
      inquiryCode: "",
    },
  });
  const children = useWatch({ control: form.control, name: "children" });

  async function onSubmit(values: CreateQuoteInput) {
    setAlert(null);
    const result = await createQuoteAction(values);
    if (!result.ok) {
      const fields = Object.entries(result.fields ?? {});
      for (const [name, message] of fields) form.setError(name as FieldPath<CreateQuoteInput>, { type: "server", message });
      if (fields.length === 0) setAlert(errorText(result.error));
      return;
    }
    toast({ title: t("created"), variant: "success" });
    router.push(`/admin/bookings/${result.id}`);
  }

  const number = (name: "adults" | "children" | "infants" | "validDays", label: string, min: number, max: number) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type="number" inputMode="numeric" min={min} max={max} {...field} value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value === "" ? null : Number(event.target.value))} />
          </FormControl>
          <FormMessage formatMessage={errorText} />
        </FormItem>
      )}
    />
  );
  const text = (name: "contactName" | "contactEmail" | "contactPhone" | "inquiryCode", label: string, type = "text") => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} autoComplete="off" {...field} />
          </FormControl>
          <FormMessage formatMessage={errorText} />
        </FormItem>
      )}
    />
  );
  const money = (name: "priceAdult" | "priceChild", label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <MoneyInput name={field.name} ref={field.ref} value={field.value ?? null} onChange={field.onChange} onBlur={field.onBlur} />
          </FormControl>
          <FormMessage formatMessage={errorText} />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-4xl flex-col gap-6" aria-label={t("title")}>
        {alert && (
          <Alert variant="destructive" live="assertive">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-5 md:grid-cols-[1fr_12rem_12rem]">
          <FormField
            control={form.control}
            name="tourId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("tour")}</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field}>
                    <option value="">{t("chooseTour")}</option>
                    {tours.map((tour) => (
                      <option key={tour.id} value={tour.id}>
                        {tour.code} · {tour.title} ({t(tour.type)})
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("startDate")}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="locale"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("locale")}</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field}>
                    <option value="vi">Tiếng Việt</option>
                    <option value="en">English</option>
                  </select>
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {number("adults", t("adults"), 1, 50)}
          {number("children", t("children"), 0, 50)}
          {number("infants", t("infants"), 0, 25)}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {money("priceAdult", t("priceAdult"))}
          {children > 0 && money("priceChild", t("priceChild"))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="plan"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("plan")}</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field}>
                    <option value="deposit">{t("planDeposit")}</option>
                    <option value="full">{t("planFull")}</option>
                  </select>
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          {number("validDays", t("validDays"), 1, 30)}
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {text("contactName", t("contactName"))}
          {text("contactEmail", t("contactEmail"), "email")}
          {text("contactPhone", t("contactPhone"), "tel")}
        </div>
        <FormField
          control={form.control}
          name="specialRequests"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("specialRequests")}</FormLabel>
              <FormControl>
                <Textarea rows={3} maxLength={2000} {...field} />
              </FormControl>
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />
        <div className="max-w-xs">{text("inquiryCode", t("inquiryCode"))}</div>
        <div>
          <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("creating") : t("create")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
