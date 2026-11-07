import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { completeGoogle } from "@/modules/identity/customer-auth.service";

const querySchema = z.object({ code: z.string().min(1).max(500) });

/**
 * OAuth callback (Google, docs/specs/phase-5-accounts-inquiries-operations.md decision 3): the
 * PKCE code is exchanged on the server; a missing or failed code goes to the error page, and staff
 * accounts are refused.
 */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({ code: request.nextUrl.searchParams.get("code") ?? undefined });
  redirect(await completeGoogle(parsed.success ? parsed.data.code : null));
}
