import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { completeEmailLink } from "@/modules/identity/customer-auth.service";

const querySchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum(["signup", "invite", "magiclink", "recovery", "email_change", "email"]),
  next: z.string().optional(),
});

/**
 * Email link handler (sign-up confirmation, email change, invitations, password recovery): verifies
 * the token hash on the server, then completes the sign-in (earlier bookings attached, decision 6
 * of the Phase 5 spec). Recovery and invitation links also mark the session for the set-password
 * pages (decision 1). `next` passes through `safeRedirectPath()`, never an open redirect.
 */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) redirect("/auth/error?error=link");

  const { token_hash, type, next } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) redirect("/auth/error?error=link");

  redirect(await completeEmailLink(type, next));
}
