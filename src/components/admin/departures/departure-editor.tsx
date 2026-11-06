"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { deleteDepartureAction, saveDepartureAction } from "@/modules/catalog/departures/departures.actions";
import {
  DEPARTURE_STATUSES,
  type DepartureEditInput,
  departureEditSchema,
  type DeparturePrices,
  MAX_CAPACITY,
} from "@/modules/catalog/departures/departures.schemas";
import type { DepartureEditorData } from "@/modules/catalog/departures/departures.service";

import { CountField, PriceFields, PriceSummary, useDepartureErrorText } from "./departure-fields";

type Failure = { ok: false; error: string; field?: string; fields?: Record<string, string> };

type Props = {
  data: DepartureEditorData;
  /** Link to the tour editor, for roles that edit tours (minimum travellers lives there). */
  tourHref?: string;
};

/**
 * Edit one departure (spec Phase 2 step 16): status, capacity (never below the reserved seats) and
 * note; prices, cancelling and reopening for admins only. Dates and seats are read-only.
 */
export function DepartureEditor({ data, tourHref }: Props) {
  const t = useTranslations("Admin.Departures");
  const tf = useTranslations("Admin.Form");
  const ts = useTranslations("Admin.Shell");
  const format = useFormatter();
  const errorText = useDepartureErrorText();
  const router = useRouter();
  const id = useId();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<DepartureEditInput>({
    resolver: zodResolver(departureEditSchema, undefined, { raw: true }),
    defaultValues: { ...data.values, prices: data.isAdmin ? data.values.prices : null },
  });

  const storedStatus = data.values.status;
  // Why "cancelled" cannot be chosen, if it cannot (the server and database check again).
  const cancelBlock = !data.isAdmin
    ? t("cancelHint")
    : data.hasOpenBookings
      ? t("cancelLocked")
      : data.isLastActive
        ? t("errors.lastDeparture")
        : null;
  const statusLocked = storedStatus === "cancelled" && !data.isAdmin;

  async function onSubmit(values: DepartureEditInput) {
    setAlert(null);
    const result = await saveDepartureAction(values);
    if (!result.ok) {
      const failure = result as Failure;
      const fields = { ...failure.fields, ...(failure.field ? { [failure.field]: failure.error } : {}) };
      for (const [name, message] of Object.entries(fields)) {
        form.setError(name as Parameters<typeof form.setError>[0], { type: "server", message });
      }
      setAlert(Object.keys(fields).length ? t("errors.fixFields") : errorText(failure.error));
      return;
    }
    toast({ title: t("saved"), variant: "success" });
    router.refresh();
  }

  const date = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00`), { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const prices = data.values.prices as DeparturePrices;

  return (
    <div className="flex max-w-4xl flex-col gap-10">
      <dl className="grid gap-x-8 gap-y-4 rounded-lg border border-border bg-card p-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-small text-muted-foreground">{t("facts.tour")}</dt>
          <dd>
            <code>{data.tour.code}</code> · {data.tour.title}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-small text-muted-foreground">{t("facts.dates")}</dt>
          <dd>
            <time dateTime={data.startDate}>{date(data.startDate)}</time> – <time dateTime={data.endDate}>{date(data.endDate)}</time>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-small text-muted-foreground">{t("facts.seats")}</dt>
          <dd className="flex flex-col gap-1">
            <span className="tabular-nums" data-testid="departure-seats">
              {data.seatsReserved}/{data.values.capacity}
            </span>
            <span className="text-small text-muted-foreground">{t("seatsReadOnly")}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-small text-muted-foreground">{t("facts.minPax")}</dt>
          <dd className="flex flex-col gap-1">
            <span>{data.tour.minPaxToOperate ?? t("minPaxNone")}</span>
            <span className="text-small text-muted-foreground">
              {t("minPaxHint")}{" "}
              {tourHref && (
                <Link href={tourHref} className="font-medium text-foreground underline underline-offset-4">
                  {t("editOnTour")}
                </Link>
              )}
            </span>
          </dd>
        </div>
      </dl>

      <Form {...form}>
        <form
          noValidate
          onSubmit={form.handleSubmit(onSubmit, () => {
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
          <div className="grid gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("status")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={statusLocked}>
                    <FormControl>
                      <SelectTrigger ref={field.ref}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DEPARTURE_STATUSES.map((value) => (
                        <SelectItem
                          key={value}
                          value={value}
                          // Leaving or entering "cancelled" is admin-only; a blocked cancel stays visible but disabled.
                          disabled={
                            (value === "cancelled" && storedStatus !== "cancelled" && cancelBlock !== null) ||
                            (value !== "cancelled" && storedStatus === "cancelled" && !data.isAdmin)
                          }
                        >
                          {t(`statuses.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {cancelBlock && storedStatus !== "cancelled" && <FormDescription>{cancelBlock}</FormDescription>}
                  {statusLocked && <FormDescription>{t("cancelHint")}</FormDescription>}
                  <FormMessage formatMessage={errorText} />
                </FormItem>
              )}
            />
            <CountField
              form={form}
              name="capacity"
              label={t("capacity")}
              hint={t("capacityMin", { reserved: data.seatsReserved })}
              min={Math.max(1, data.seatsReserved)}
              max={MAX_CAPACITY}
            />
          </div>
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("note")}</FormLabel>
                <FormControl>
                  <Textarea rows={3} maxLength={500} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          <section aria-labelledby={`${id}-prices`} className="flex flex-col gap-4 border-t border-border pt-8">
            <h2 id={`${id}-prices`} className="font-serif text-h3 font-semibold">
              {t("pricesTitle")}
            </h2>
            {data.isAdmin ? (
              <PriceFields form={form} />
            ) : (
              <>
                <p className="text-small text-muted-foreground">{t("pricesReadOnly")}</p>
                <PriceSummary prices={prices} />
              </>
            )}
          </section>
          <div className="border-t border-border pt-8">
            <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Form>

      {/* Outside the form: nothing in the dialog may submit it. */}
      <div>
        <ConfirmDialog
          trigger={
            <Button type="button" variant="ghost" className="text-destructive">
              <Trash2 strokeWidth={1.5} aria-hidden="true" />
              {t("delete")}
            </Button>
          }
          title={t("deleteTitle")}
          description={t("deleteBody")}
          confirmLabel={t("deleteConfirm")}
          cancelLabel={tf("cancel")}
          closeLabel={ts("close")}
          errorLabel={tf("actionFailed")}
          destructive
          onConfirm={async () => {
            const result = await deleteDepartureAction({ id: data.values.id });
            if (!result.ok) {
              toast({ title: errorText((result as Failure).error), variant: "destructive" });
              return;
            }
            toast({ title: t("deleted"), variant: "success" });
            router.push(`/admin/departures?tour=${data.tour.id}`);
          }}
        />
      </div>
    </div>
  );
}
