"use server";

import { headers } from "next/headers";

import { confirmSchema, type ConfirmStatus, subscribeSchema, type SubscribeStatus } from "./newsletter.schemas";
import { confirm, subscribe } from "./newsletter.service";

/** The client's IP as Vercel forwards it (first `x-forwarded-for` entry). */
async function requestMeta() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip")?.trim() || null;
  const ip = forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : null;
  return { ip, userAgent: list.get("user-agent")?.slice(0, 500) ?? null };
}

export type SubscribeState = { status: SubscribeStatus };

/** Newsletter sign-up (guest write): Zod, honeypot, then the service's rate limit and Turnstile. */
export async function subscribeToNewsletter(_previous: SubscribeState, formData: FormData): Promise<SubscribeState> {
  const parsed = subscribeSchema.safeParse({
    email: formData.get("email"),
    locale: formData.get("locale"),
    turnstileToken: formData.get("cf-turnstile-response") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) return { status: "invalidEmail" };
  // A filled honeypot is a bot: answer as if it worked, do nothing.
  if (parsed.data.website) return { status: "sent" };
  const { ip } = await requestMeta();
  return { status: await subscribe({ email: parsed.data.email, locale: parsed.data.locale, turnstileToken: parsed.data.turnstileToken, ip }) };
}

export type ConfirmState = { status: ConfirmStatus };

/** Confirms a subscription from the confirmation page's button. */
export async function confirmNewsletter(_previous: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const parsed = confirmSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return { status: "invalid" };
  const meta = await requestMeta();
  return { status: await confirm({ token: parsed.data.token, ...meta }) };
}
