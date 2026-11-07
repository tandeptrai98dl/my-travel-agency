import type { ReactNode } from "react";

import { formatDateRange } from "@/lib/dates";
import { formatVnd } from "@/lib/money";

import { type DetailRow, Details, type EmailBrand, EmailLayout, Eyebrow, Heading, SignOff, Text } from "./layout";

/** A translator over the `Emails` namespace (next-intl's `createTranslator`, see booking-emails.ts). */
export type EmailT = (key: string, values?: Record<string, string | number>) => string;

export type EmailLocale = "vi" | "en";

/** What every booking email shows. No passport numbers, no payment details beyond amounts. */
export type BookingFacts = {
  code: string;
  tourTitle: string;
  startDate: string;
  endDate: string | null;
  adults: number;
  children: number;
  infants: number;
  total: number;
  amountPaid: number;
  balanceDueDate: string | null;
};

export type BaseEmailProps = {
  locale: EmailLocale;
  t: EmailT;
  brand: EmailBrand;
  booking: BookingFacts;
};

/** "14:30, 21/11/2026" (vi) or "21/11/2026, 14:30" (en) in Vietnam time. */
export function formatDateTime(iso: string, locale: EmailLocale): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function partyText(t: EmailT, booking: Pick<BookingFacts, "adults" | "children" | "infants">): string {
  const parts = [t("common.adults", { count: booking.adults })];
  if (booking.children > 0) parts.push(t("common.children", { count: booking.children }));
  if (booking.infants > 0) parts.push(t("common.infants", { count: booking.infants }));
  return parts.join(", ");
}

export function balanceOf(booking: Pick<BookingFacts, "total" | "amountPaid">): number {
  return Math.max(booking.total - booking.amountPaid, 0);
}

/** Booking code, journey, dates and travellers; with `amounts`, the total, paid and balance lines. */
export function bookingRows(t: EmailT, locale: EmailLocale, booking: BookingFacts, amounts: boolean): DetailRow[] {
  const rows: DetailRow[] = [
    { label: t("common.code"), value: booking.code },
    { label: t("common.journey"), value: booking.tourTitle },
    { label: t("common.dates"), value: formatDateRange(booking.startDate, booking.endDate ?? booking.startDate, locale) },
    { label: t("common.travellers"), value: partyText(t, booking) },
  ];
  if (!amounts) return rows;
  rows.push({ label: t("common.total"), value: formatVnd(booking.total, locale) });
  rows.push({ label: t("common.paid"), value: formatVnd(booking.amountPaid, locale) });
  const balance = balanceOf(booking);
  if (balance > 0) {
    rows.push({
      label: t("common.balance"),
      value: booking.balanceDueDate
        ? t("common.balanceDue", { amount: formatVnd(balance, locale), date: formatDateRange(booking.balanceDueDate, booking.balanceDueDate, locale) })
        : formatVnd(balance, locale),
    });
  }
  return rows;
}

type CustomerEmailProps = BaseEmailProps & {
  preview: string;
  eyebrow: string;
  heading: string;
  /** Greeting name: the booking's contact name. */
  name: string;
  amounts: boolean;
  /** Paragraphs and the action between the greeting and the details. */
  children: ReactNode;
  /** Paragraphs after the details. */
  after?: ReactNode;
};

/** The frame of every customer email: greeting, message, booking details, help line, sign-off. */
export function CustomerEmail({ locale, t, brand, booking, preview, eyebrow, heading, name, amounts, children, after }: CustomerEmailProps) {
  const help =
    brand.email && brand.phone
      ? t("common.helpBoth", { email: brand.email, phone: brand.phone })
      : brand.email
        ? t("common.helpEmail", { email: brand.email })
        : brand.phone
          ? t("common.helpPhone", { phone: brand.phone })
          : null;
  return (
    <EmailLayout lang={locale} preview={preview} brand={brand} reason={t("common.reason", { brand: brand.name })}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading>{heading}</Heading>
      <Text>{t("common.greeting", { name })}</Text>
      {children}
      <Details rows={bookingRows(t, locale, booking, amounts)} />
      {after}
      {help && <Text muted>{help}</Text>}
      <SignOff closing={t("common.closing")} team={t("common.team", { brand: brand.name })} />
    </EmailLayout>
  );
}
