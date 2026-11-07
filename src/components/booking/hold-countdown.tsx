"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const pad = (value: number) => String(value).padStart(2, "0");

/** A real countdown to `hold_expires_at` (decision 4); at zero the page reloads its state. */
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const t = useTranslations("Checkout");
  const router = useRouter();
  const end = new Date(expiresAt).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (now !== null && now >= end) router.refresh();
  }, [now, end, router]);

  if (now === null) return null;
  const left = Math.max(0, Math.floor((end - now) / 1000));
  if (left === 0) return <p className="font-medium text-destructive">{t("holdExpired")}</p>;
  const time = left >= 3600 ? `${Math.floor(left / 3600)}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}` : `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
  // Announce the time only now and then, not every second.
  return (
    <p className="text-body font-medium tabular-nums" data-testid="hold-countdown">
      <span aria-hidden="true">{t("countdown", { time })}</span>
      <span className="sr-only" aria-live="polite">
        {left % 300 === 0 || left === 60 ? t("countdown", { time }) : ""}
      </span>
    </p>
  );
}
