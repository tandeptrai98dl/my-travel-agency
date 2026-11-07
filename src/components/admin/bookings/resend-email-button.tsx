"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { resendEmailAction } from "@/modules/booking/booking-emails.actions";

/** Sends one customer email again with a fresh key (4F "resend emails"). */
export function ResendEmailButton({ logId, bookingId, label }: { logId: string; bookingId: string; label: string }) {
  const t = useTranslations("Admin.BookingDetail");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      aria-busy={busy}
      aria-label={`${t("emailResend")}: ${label}`}
      onClick={async () => {
        setBusy(true);
        const result = await resendEmailAction({ logId, bookingId });
        setBusy(false);
        if (result.ok && result.status === "sent") toast({ title: t("emailResent") });
        else if (result.ok && result.status === "unavailable") toast({ title: t("emailResendSkipped") });
        else toast({ title: t("emailResendFailed"), variant: "destructive" });
        router.refresh();
      }}
    >
      {busy ? t("emailResending") : t("emailResend")}
    </Button>
  );
}
