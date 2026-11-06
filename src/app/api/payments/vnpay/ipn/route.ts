import { connection, NextResponse } from "next/server";
import { z } from "zod";

import { handleVnpayIpn } from "@/modules/payment/payment.service";

// VNPay sends vnp_* query parameters; anything else is ignored. Values are short strings.
const ipnSchema = z.record(z.string().regex(/^vnp_[A-Za-z]+$/), z.string().max(512));

/**
 * VNPay IPN (docs/specs/phase-4-booking-payments.md decision 6). The only place a VNPay payment is
 * confirmed: the signature, merchant and amount are checked, then record_payment_event() records
 * it. Answers VNPay's JSON (RspCode/Message) with 200, as VNPay requires.
 */
export async function GET(request: Request) {
  await connection();
  const raw = Object.fromEntries(
    [...new URL(request.url).searchParams.entries()].filter(([key]) => key.startsWith("vnp_")),
  );
  const parsed = ipnSchema.safeParse(raw);
  const body = parsed.success && parsed.data.vnp_SecureHash && parsed.data.vnp_TxnRef
    ? await handleVnpayIpn(parsed.data)
    : { RspCode: "97", Message: "Invalid Checksum" };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
