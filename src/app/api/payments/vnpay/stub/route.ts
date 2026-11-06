import { randomInt } from "node:crypto";

import { connection, NextResponse } from "next/server";
import { z } from "zod";

import { vnpayConfig, vnpayStubEnabled } from "@/modules/payment/payment.config";
import { handleVnpayIpn } from "@/modules/payment/payment.service";
import { sign, verifySignature } from "@/modules/payment/providers/vnpay";

/**
 * CI stand-in for VNPay's payment page (VNPAY_STUB=true; refused when VERCEL_ENV=production by the
 * env schema and here). It accepts only payment URLs this app signed, and answers like VNPay: a
 * signed IPN to our own handler, then a signed browser return. Signature checks are never skipped.
 */
const notFound = () => new NextResponse("Not found", { status: 404 });

const outcomeSchema = z.object({ outcome: z.enum(["success", "failure"]), params: z.string().max(4000) });

function signedPaymentParams(search: URLSearchParams, secret: string) {
  const params = Object.fromEntries([...search.entries()].filter(([key]) => key.startsWith("vnp_")));
  return verifySignature(params, secret) ? params : null;
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function GET(request: Request) {
  await connection();
  const config = vnpayConfig();
  if (!vnpayStubEnabled() || !config) return notFound();
  const search = new URL(request.url).searchParams;
  const params = signedPaymentParams(search, config.hashSecret);
  if (!params) return new NextResponse("Invalid signature", { status: 400 });
  const query = escape(search.toString());
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>VNPay stub</title></head><body>
<main><h1>VNPay stub</h1><p>Reference <strong>${escape(params.vnp_TxnRef)}</strong>, amount <strong>${escape(String(Number(params.vnp_Amount) / 100))}</strong> VND.</p>
<form method="post"><input type="hidden" name="params" value="${query}"><button name="outcome" value="success">Pay</button> <button name="outcome" value="failure">Cancel payment</button></form></main>
</body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  await connection();
  const config = vnpayConfig();
  if (!vnpayStubEnabled() || !config) return notFound();
  const parsed = outcomeSchema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });
  const params = signedPaymentParams(new URLSearchParams(parsed.data.params), config.hashSecret);
  if (!params) return new NextResponse("Invalid signature", { status: 400 });
  const ok = parsed.data.outcome === "success";
  const result: Record<string, string> = {
    vnp_Amount: params.vnp_Amount,
    vnp_BankCode: "NCB",
    vnp_OrderInfo: params.vnp_OrderInfo,
    vnp_PayDate: params.vnp_CreateDate,
    vnp_ResponseCode: ok ? "00" : "24",
    vnp_TmnCode: params.vnp_TmnCode,
    vnp_TransactionNo: String(randomInt(10_000_000, 99_999_999)),
    vnp_TransactionStatus: ok ? "00" : "02",
    vnp_TxnRef: params.vnp_TxnRef,
  };
  const signed = { ...result, vnp_SecureHash: sign(result, config.hashSecret) };
  await handleVnpayIpn(signed);
  const back = new URL(params.vnp_ReturnUrl);
  for (const [key, value] of Object.entries(signed)) back.searchParams.set(key, value);
  return NextResponse.redirect(back, { status: 303 });
}
