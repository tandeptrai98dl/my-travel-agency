import { connection, NextResponse } from "next/server";

import { getPathname } from "@/i18n/navigation";
import { vnpayReturnTarget } from "@/modules/payment/payment.service";

/**
 * Where VNPay sends the browser back. Display only (brief §6): the signature is checked so the
 * customer lands on their own result page, which waits for the IPN; nothing is recorded here.
 */
export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const target = await vnpayReturnTarget(url.searchParams);
  const path = target
    ? getPathname({ href: { pathname: "/checkout/[code]/result", params: { code: target.code } }, locale: target.locale })
    : "/";
  return NextResponse.redirect(new URL(path, url.origin), { status: 303, headers: { "Cache-Control": "no-store" } });
}
