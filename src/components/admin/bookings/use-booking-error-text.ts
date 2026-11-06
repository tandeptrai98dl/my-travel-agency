"use client";

import { useTranslations } from "next-intl";

/** Zod messages and server error codes are keys in `Admin.Bookings.errors`. */
export function useBookingErrorText() {
  const t = useTranslations("Admin.Bookings.errors");
  return (key: string) => (t.has(key) ? t(key) : t("failed"));
}
