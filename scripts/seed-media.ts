/**
 * Uploads generated placeholder images for the seed's sample media rows (local development).
 *
 *   npm run seed:media                                   # local Supabase
 *   npm run seed:media -- --allow-remote=<project-host>  # e.g. staging
 *
 * `supabase/seed.sql` inserts `public.media` rows (credit `Sample image`) for the tour heroes and
 * journal covers, but SQL cannot upload files, so those images are empty frames until this runs.
 * Objects that already exist are skipped, so re-running is safe and never overwrites an image
 * someone uploaded; rows with any other credit are never read or touched (`scripts/lib/seed-media.ts`).
 *
 * Same guard as `seed:users`: a non-local NEXT_PUBLIC_SUPABASE_URL needs `--allow-remote=<exact host>`.
 * It refuses outright when VERCEL_ENV is production or the Supabase host is listed in PRODUCTION_HOSTS.
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (`.env.local` is loaded when present).
 * Prints counts only. The images are placeholders: real photos go in through /admin/media.
 *
 * Like `seed-users.ts`, this file only runs `main()`: no entry-point check, which can silently skip
 * the run on Windows (drive-letter case, junctions, `subst` drives).
 */
import { createClient } from "@supabase/supabase-js";

import { checkTarget, createSupabaseStore, seedSampleMedia } from "./lib/seed-media.ts";

function fail(message: string): never {
  console.error(`seed:media: ${message}`);
  process.exit(1);
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: rely on the shell environment.
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const target = checkTarget({
    url,
    allowRemote: process.argv.find((arg) => arg.startsWith("--allow-remote="))?.slice("--allow-remote=".length),
    vercelEnv: process.env.VERCEL_ENV,
    productionHosts: process.env.PRODUCTION_HOSTS,
  });
  if (!target.ok || !url) fail(target.ok ? "NEXT_PUBLIC_SUPABASE_URL is not set." : target.message);
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) fail("SUPABASE_SECRET_KEY is not set.");

  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const counts = await seedSampleMedia(createSupabaseStore(supabase));
  console.log(`seed:media: created ${counts.created}, skipped ${counts.skipped}, failed ${counts.failed}`);
  if (counts.failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
