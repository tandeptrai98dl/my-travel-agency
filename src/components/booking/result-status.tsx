"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { purchase as purchaseEvent, type TourItem } from "@/components/analytics/events";
import { track } from "@/components/analytics/track";
import { checkoutStatusAction } from "@/modules/booking/checkout.actions";

type Status = { status: string; paymentState: string };

/**
 * "Waiting for confirmation" (decision 6): the browser return never confirms anything; this
 * polls the booking until the IPN or the bank webhook has been recorded.
 */
export function ResultStatus({
  code,
  initial,
  email,
  payHref,
  purchase,
}: {
  code: string;
  initial: Status;
  email: string;
  payHref: string;
  /** GA4 `purchase` once the booking shows as confirmed (ADR-039); deduplicated by the loader. */
  purchase?: { transactionId: string | null; value: number; tour: TourItem };
}) {
  const t = useTranslations("Checkout");
  const [state, setState] = useState(initial);
  const [polls, setPolls] = useState(0);
  const done = state.status === "confirmed" || state.status === "completed" || state.status === "cancelled" || state.status === "expired";
  const confirmed = state.status === "confirmed" || state.status === "completed";

  useEffect(() => {
    if (confirmed && purchase?.transactionId) track(purchaseEvent({ transactionId: purchase.transactionId, value: purchase.value, tour: purchase.tour }));
    // Once, when the confirmation first shows; the payload is fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);

  useEffect(() => {
    if (done || polls >= 60) return;
    const timer = setTimeout(async () => {
      const next = await checkoutStatusAction(code);
      if (next) setState({ status: next.status, paymentState: next.paymentState });
      setPolls((count) => count + 1);
    }, 3000);
    return () => clearTimeout(timer);
  }, [code, done, polls]);

  if (state.status === "confirmed" || state.status === "completed") {
    return (
      <div role="status" className="flex flex-col gap-3" data-testid="checkout-result" data-status={state.status}>
        <h2 className="font-serif text-h2 font-medium lg:text-h2-lg">{t("confirmed")}</h2>
        <p className="text-body-lg text-muted-foreground">{t("confirmedBody", { email })}</p>
      </div>
    );
  }
  if (state.status === "expired" || state.status === "cancelled") {
    return (
      <div role="status" className="flex flex-col gap-3" data-testid="checkout-result" data-status={state.status}>
        <h2 className="font-serif text-h2 font-medium lg:text-h2-lg">{t("notConfirmed")}</h2>
        <p className="text-body-lg text-muted-foreground">{t(`statuses.${state.status}`)}</p>
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-col gap-3" data-testid="checkout-result" data-status={state.status}>
      <h2 className="font-serif text-h2 font-medium lg:text-h2-lg">{t("waiting")}</h2>
      <p className="text-body-lg text-muted-foreground">{polls >= 60 ? t("stillWaiting") : t("waitingBody")}</p>
      {polls >= 60 && (
        <a href={payHref} className="text-small underline underline-offset-4">
          {t("tryAgain")}
        </a>
      )}
    </div>
  );
}
