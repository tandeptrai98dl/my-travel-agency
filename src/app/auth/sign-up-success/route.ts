import { NextResponse } from "next/server";

/** Staff are invited (ADR-032); the starter's self sign-up moved to the customer page. */
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/dang-ky", request.url), 308);
}
