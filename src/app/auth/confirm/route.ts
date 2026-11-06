import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum(["signup", "invite", "magiclink", "recovery", "email_change", "email"]),
  next: z.string().optional(),
});

/** Email link handler (sign-up confirmation, invitations, password recovery). */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    redirect(`/auth/error?error=${encodeURIComponent("Invalid or incomplete link")}`);
  }

  const { token_hash, type, next } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  // Only same-site paths: `next` comes from the URL and must not become an open redirect.
  redirect(safeRedirectPath(next, "/admin"));
}
