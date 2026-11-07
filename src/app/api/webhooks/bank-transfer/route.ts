import { connection, NextResponse } from "next/server";

import { bankWebhookGate, handleBankWebhook } from "@/modules/payment/payment.service";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * SePay or Casso bank-transfer webhook (docs/specs/phase-4-booking-payments.md decision 6).
 * Without BANK_WEBHOOK_PROVIDER and BANK_WEBHOOK_SECRET it answers 503 and records nothing.
 * The body is validated by the provider's Zod schema in the payment module.
 */
export async function POST(request: Request) {
  await connection();
  // Settings and the source allow-list before anything of the body is read (Phase 6 decision 2).
  const refused = await bankWebhookGate(request.headers);
  if (refused) return NextResponse.json(refused.body, { status: refused.status, headers: { "Cache-Control": "no-store" } });
  // Refuse a declared oversized body before reading it; the length is checked again after.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) {
    return NextResponse.json({ success: false }, { status: 413 });
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ success: false }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const reply = await handleBankWebhook(request.headers, body);
  return NextResponse.json(reply.body, { status: reply.status, headers: { "Cache-Control": "no-store" } });
}
