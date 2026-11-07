"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { redeemLinkAction } from "@/modules/booking/checkout.actions";

/** Uses the payment link up only on this click (mail scanners only ever GET the page). */
export function RedeemLinkButton({ token }: { token: string }) {
  const t = useTranslations("PayLink");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titles: Record<string, string> = {
    used: t("usedTitle"),
    expired: t("expiredTitle"),
    not_payable: t("notPayableTitle"),
    unavailable: t("unavailableTitle"),
    invalid: t("invalidTitle"),
  };
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive" live="assertive">
          <AlertDescription>{titles[error] ?? titles.invalid}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button
          size="lg"
          disabled={busy}
          aria-busy={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await redeemLinkAction(token);
            if (result.ok) {
              router.push(result.path);
              return;
            }
            setBusy(false);
            setError(result.error);
          }}
        >
          {busy ? t("continuing") : t("continue")}
        </Button>
      </div>
    </div>
  );
}
