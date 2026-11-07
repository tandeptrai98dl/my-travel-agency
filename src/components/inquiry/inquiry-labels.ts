import "server-only";

import { getTranslations } from "next-intl/server";

import type { InquiryContactLabels } from "./inquiry-fields";
import type { InquirySuccessLabels } from "./inquiry-success";
import type { TailorMadeLabels } from "./tailor-made-wizard";
import type { TourInquiryLabels } from "./tour-inquiry-form";

const ERRORS = ["required", "tooLong", "invalidEmail", "invalidPhone", "consentRequired", "invalid", "verification", "rateLimited", "unavailable", "failed"];

/** Plain labels for the inquiry client components (no next-intl in public client code, ADR-029). */
async function shared(locale: "vi" | "en"): Promise<InquiryContactLabels & { monthUndecided: string; messagePlaceholder: string; success: InquirySuccessLabels }> {
  const t = await getTranslations({ locale, namespace: "Inquiry" });
  return {
    name: t("name"),
    email: t("email"),
    phone: t("phone"),
    preferred: t("preferred"),
    channels: { email: t("channels.email"), phone: t("channels.phone"), zalo: t("channels.zalo"), whatsapp: t("channels.whatsapp") },
    adults: t("adults"),
    children: t("children"),
    month: t("month"),
    monthHint: t("monthHint"),
    monthUndecided: t("monthUndecided"),
    message: t("message"),
    messagePlaceholder: t("messagePlaceholder"),
    consent: t("consent"),
    privacyLink: t("privacyLink"),
    newTab: t("newTab"),
    sending: t("sending"),
    unavailable: t("unavailable"),
    errors: Object.fromEntries(ERRORS.map((key) => [key, t(`errors.${key}`)])),
    success: {
      title: t("success.title"),
      text: t("success.text", { code: "{code}" }),
      textNoCode: t("success.textNoCode"),
      next: t("success.next"),
      tours: t("success.tours"),
      home: t("success.home"),
    },
  };
}

export async function tailorMadeLabels(locale: "vi" | "en"): Promise<TailorMadeLabels> {
  const [base, t] = await Promise.all([shared(locale), getTranslations({ locale, namespace: "TailorMade" })]);
  const five = (key: string) => t.raw(key) as [string, string, string, string, string];
  return {
    ...base,
    steps: five("steps"),
    stepTitles: five("stepTitles"),
    stepOf: t("stepOf", { step: "{step}", count: "{count}" }),
    destinationsHint: t("destinationsHint"),
    destinationsOther: t("destinationsOther"),
    flexible: t("flexible"),
    duration: t("duration"),
    durationHint: t("durationHint"),
    budget: t("budget"),
    budgets: Object.fromEntries(["under_30m", "30_60m", "60_100m", "100_200m", "over_200m", "not_sure"].map((key) => [key, t(`budgets.${key}`)])),
    style: t("style"),
    styleNone: t("styleNone"),
    country: t("country"),
    company: t("company"),
    companyHint: t("companyHint"),
    messageHint: t("messageHint"),
    next: t("next"),
    back: t("back"),
    submit: t("submit"),
    draftRestored: t("draftRestored"),
  };
}

export async function tourInquiryLabels(locale: "vi" | "en"): Promise<TourInquiryLabels> {
  const [base, t] = await Promise.all([shared(locale), getTranslations({ locale, namespace: "TourInquiry" })]);
  return { ...base, submit: t("submit") };
}
