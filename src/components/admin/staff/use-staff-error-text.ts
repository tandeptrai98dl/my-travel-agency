"use client";

import { useTranslations } from "next-intl";

/** Zod messages and server error codes are keys in `Admin.Staff.errors`. */
export function useStaffErrorText() {
  const t = useTranslations("Admin.Staff.errors");
  return (key: string) => (t.has(key) ? t(key) : t("invalid"));
}
