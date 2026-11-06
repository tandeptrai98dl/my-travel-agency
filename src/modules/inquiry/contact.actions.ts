"use server";

import { headers } from "next/headers";

import { type ContactField, contactSchema, type ContactStatus } from "./contact.schemas";
import { submitContact } from "./contact.service";

export type ContactState = { status: ContactStatus; code?: string; errors?: Partial<Record<ContactField, string>> };

/** The client's IP as Vercel forwards it (first `x-forwarded-for` entry). */
async function requestMeta() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip")?.trim() || null;
  const ip = forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : null;
  return { ip, userAgent: list.get("user-agent")?.slice(0, 500) ?? null };
}

/** Contact form (guest write): Zod with field errors, honeypot, then the service. */
export async function sendContactMessage(_previous: ContactState, formData: FormData): Promise<ContactState> {
  const value = (key: string) => formData.get(key) ?? undefined;
  const parsed = contactSchema.safeParse({
    name: value("name"),
    email: value("email"),
    phone: value("phone") ?? "",
    preferredContact: value("preferredContact"),
    message: value("message"),
    tourCode: value("tourCode") ?? "",
    consent: value("consent"),
    locale: value("locale"),
    turnstileToken: value("cf-turnstile-response") ?? "",
    website: value("website") ?? "",
  });
  if (!parsed.success) {
    const errors: Partial<Record<ContactField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as ContactField;
      if (["name", "email", "phone", "message", "consent"].includes(field) && !errors[field]) errors[field] = issue.message;
    }
    return { status: "invalid", errors };
  }
  // A filled honeypot is a bot: answer as if it worked, save nothing.
  if (parsed.data.website) return { status: "sent" };
  const meta = await requestMeta();
  return submitContact(parsed.data, { turnstileToken: parsed.data.turnstileToken, ...meta });
}
