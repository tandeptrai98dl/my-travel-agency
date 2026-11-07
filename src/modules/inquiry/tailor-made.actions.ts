"use server";

import { headers } from "next/headers";

import { INQUIRY_FIELDS, type InquiryField, inquirySchema, type InquiryState, UTM_KEYS } from "./tailor-made.schemas";
import { submitInquiry } from "./tailor-made.service";

async function requestMeta() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip")?.trim() || null;
  const ip = forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : null;
  return { ip, userAgent: list.get("user-agent")?.slice(0, 500) ?? null };
}

/** The tailor-made wizard and the private-tour inquiry form (guest writes): Zod, honeypot, then the service. */
export async function sendInquiry(_previous: InquiryState, formData: FormData): Promise<InquiryState> {
  const value = (name: string) => formData.get(name) ?? undefined;
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const tag = formData.get(`utm_${key}`);
    if (typeof tag === "string" && tag.trim()) utm[key] = tag;
  }
  const parsed = inquirySchema.safeParse({
    source: value("source"),
    locale: value("locale"),
    destinations: formData.getAll("dest").filter((item) => typeof item === "string"),
    destinationsOther: value("destinationsOther") ?? "",
    travelMonth: value("travelMonth") ?? "",
    flexibleDates: formData.get("flexibleDates") === "on",
    durationDays: value("durationDays") ?? "",
    adults: value("adults"),
    children: value("children") ?? 0,
    budget: value("budget") ?? "",
    travelStyle: value("travelStyle") ?? "",
    tourCode: value("tourCode") ?? "",
    name: value("name"),
    email: value("email"),
    phone: value("phone") ?? "",
    preferredContact: value("preferredContact"),
    companyName: value("companyName") ?? "",
    country: value("country") ?? "",
    message: value("message") ?? "",
    utm,
    consent: value("consent"),
    turnstileToken: value("cf-turnstile-response") ?? "",
    website: value("website") ?? "",
  });
  if (!parsed.success) {
    const errors: Partial<Record<InquiryField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as InquiryField;
      if ((INQUIRY_FIELDS as readonly string[]).includes(field) && !errors[field]) errors[field] = issue.message;
    }
    return { status: "invalid", errors };
  }
  // A filled honeypot is a bot: answer as if it worked, save nothing.
  if (parsed.data.website) return { status: "sent" };
  const result = await submitInquiry(parsed.data, { turnstileToken: parsed.data.turnstileToken, ...(await requestMeta()) });
  return { status: result.status, code: result.code };
}
