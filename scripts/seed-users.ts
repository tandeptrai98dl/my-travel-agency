/**
 * Creates one sample account per role through the Supabase Auth Admin API (local development).
 *
 *   SEED_USER_PASSWORD=... npm run seed:users                 # local Supabase only
 *   SEED_USER_PASSWORD=... npm run seed:users -- --allow-remote  # e.g. the staging project
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from the environment (`.env.local` is
 * loaded when present). Accounts are `<role>@example.test`, email already confirmed. Re-running
 * is safe: existing accounts get their role and password reset. Passwords are never printed.
 * Admin and accountant still have to enrol TOTP MFA on first sign-in (ADR-009).
 */
import { createClient } from "@supabase/supabase-js";

const ROLES = [
  "customer",
  "sales",
  "sales_manager",
  "operator",
  "accountant",
  "editor",
  "admin",
] as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "host.docker.internal"]);

function fail(message: string): never {
  console.error(`seed:users: ${message}`);
  process.exit(1);
}

function readConfig() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: rely on the shell environment.
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const password = process.env.SEED_USER_PASSWORD;
  const allowRemote = process.argv.includes("--allow-remote");

  if (!url) fail("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!secretKey) fail("SUPABASE_SECRET_KEY is not set.");
  if (!password || password.length < 12) {
    fail("SEED_USER_PASSWORD must be set and at least 12 characters long.");
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
  if (!LOCAL_HOSTS.has(host) && !allowRemote) {
    fail(`refusing to seed users on non-local host "${host}". Pass --allow-remote to confirm.`);
  }

  return { url, secretKey, password };
}

async function main() {
  const { url, secretKey, password } = readConfig();
  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // A handful of users at most in development; one page is enough.
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) fail(`could not list users: ${listError.message}`);
  const existing = new Map(list.users.map((user) => [user.email?.toLowerCase(), user.id]));

  for (const role of ROLES) {
    const email = `${role.replace("_", "-")}@example.test`;
    let userId = existing.get(email);

    if (userId) {
      const { error } = await supabase.auth.admin.updateUserById(userId, { password });
      if (error) fail(`could not update ${email}: ${error.message}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: `Sample ${role.replace("_", " ")}`, locale: "vi" },
      });
      if (error || !data.user) fail(`could not create ${email}: ${error?.message ?? "no user returned"}`);
      userId = data.user.id;
    }

    // The service role is trusted by guard_profile_update(), so it may set the role directly.
    const { error: roleError } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);
    if (roleError) fail(`could not set the role for ${email}: ${roleError.message}`);

    console.log(`seed:users: ${email} -> ${role}`);
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
