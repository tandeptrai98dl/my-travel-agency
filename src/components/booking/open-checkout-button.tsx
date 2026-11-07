"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { openEmailLinkAction } from "@/modules/booking/checkout.actions";

/**
 * Opens a booking from the checkout link in an email (4E) only on this click: the single-use token
 * is used up, the browser gets a fresh access cookie and the token leaves the address bar. Mail
 * scanners only ever GET the page.
 */
export function OpenCheckoutButton({ code, token }: { code: string; token: string }) {
  const t = useTranslations("CheckoutLink");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<"used" | "expired" | "invalid" | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {failed && (
        <Alert variant="destructive" live="assertive">
          <AlertDescription>{failed === "used" ? t("usedBody") : failed === "expired" ? t("expiredBody") : t("failed")}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button
          size="lg"
          disabled={busy}
          aria-busy={busy}
          onClick={async () => {
            setBusy(true);
            setFailed(null);
            const result = await openEmailLinkAction(code, token);
            if (result.ok) {
              router.replace(result.path);
              router.refresh();
              return;
            }
            setBusy(false);
            setFailed(result.error);
          }}
        >
          {busy ? t("opening") : t("open")}
        </Button>
      </div>
    </div>
  );
}
