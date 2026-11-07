"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatVnd } from "@/lib/money";
import { createPaymentLinkAction } from "@/modules/booking/quote.actions";

import { useBookingErrorText } from "./use-booking-error-text";

/**
 * A single-use payment link for what is due now (spec Phase 4 step 14). The URL exists only in
 * this answer (the database keeps its hash), so it is shown once with a copy button.
 */
export function PaymentLinkForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Admin.PaymentLink");
  const errorText = useBookingErrorText();
  const router = useRouter();
  const id = useId();
  const [hours, setHours] = useState("72");
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; amount: number; expiresAt: string; email: "queued" | "skipped" } | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setAlert(null);
    const result = await createPaymentLinkAction({ bookingId, validHours: Number(hours) });
    setBusy(false);
    if (!result.ok) {
      setAlert(errorText(result.fields?.validHours ?? result.error));
      return;
    }
    setLink(result);
    setCopied(false);
    router.refresh();
  }

  return (
    <form onSubmit={create} className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="font-sans text-h4 font-semibold">
        {t("title")}
      </h3>
      <p className="text-small text-muted-foreground">{t("help")}</p>
      {alert && (
        <Alert variant="destructive" live="assertive">
          <AlertDescription>{alert}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-hours`}>{t("validHours")}</Label>
          <Input id={`${id}-hours`} type="number" inputMode="numeric" min={1} max={168} value={hours} onChange={(event) => setHours(event.target.value)} className="w-28" />
        </div>
        <Button type="submit" variant="outline" disabled={busy} aria-busy={busy}>
          {busy ? t("creating") : t("create")}
        </Button>
      </div>
      {link && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary p-3 text-small" role="status">
          <span>
            {t("created", {
              amount: formatVnd(link.amount, "vi"),
              time: new Date(link.expiresAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }),
            })}
          </span>
          <span data-testid="payment-link-email" data-state={link.email}>
            {t(`email.${link.email}`)}
          </span>
          <code className="break-all" data-testid="payment-link-url">
            {link.url}
          </code>
          <div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
