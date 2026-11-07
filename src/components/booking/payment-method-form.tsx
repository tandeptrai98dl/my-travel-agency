"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { startPaymentAction } from "@/modules/booking/checkout.actions";

type Method = "vnpay" | "bank_transfer";

/**
 * Method choice (decision 4): choosing one holds the seats. VNPay continues on VNPay's page; a
 * bank transfer reloads the page, which then shows the VietQR code for the open attempt.
 */
export function PaymentMethodForm({ code, methods, submitLabel }: { code: string; methods: Method[]; submitLabel: string }) {
  const t = useTranslations("Checkout");
  const errors = useTranslations("Booking.errors");
  const router = useRouter();
  const id = useId();
  const [method, setMethod] = useState<Method>(methods[0]);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setAlert(null);
    const result = await startPaymentAction({ code, provider: method });
    if (!result.ok) {
      setBusy(false);
      setAlert(errors.has(result.error) ? errors(result.error) : errors("failed"));
      return;
    }
    if (result.instructions.kind === "redirect") {
      window.location.assign(result.instructions.url);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" aria-labelledby={`${id}-legend`}>
      {alert && (
        <Alert variant="destructive" live="assertive">
          <AlertDescription>{alert}</AlertDescription>
        </Alert>
      )}
      <fieldset className="flex flex-col gap-3">
        <legend id={`${id}-legend`} className="mb-2 text-body font-semibold">
          {t("methods")}
        </legend>
        {methods.map((value) => (
          <label key={value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" />
            <span className="flex flex-col">
              <span className="font-medium">{t(value)}</span>
              <span className="text-small text-muted-foreground">{value === "vnpay" ? t("vnpayHint") : t("bankHint")}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <Button type="submit" size="lg" disabled={busy} aria-busy={busy}>
          {busy ? t("starting") : submitLabel}
        </Button>
      </div>
    </form>
  );
}
