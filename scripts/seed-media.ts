/**
 * Uploads images for the seed's sample media rows (local development).
 *
 *   npm run seed:media                                   # local Supabase, generated drawings
 *   npm run seed:media -- --photos                       # real free photos (needs internet)
 *   npm run seed:media -- --allow-remote=<project-host>  # e.g. staging
 *
 * `supabase/seed.sql` inserts `public.media` rows (credit `Sample image`) for the tour heroes and
 * journal covers, but SQL cannot upload files, so those images are empty frames until this runs.
 * Objects that already exist are skipped, so re-running is safe and never overwrites an image
 * someone uploaded (admin uploads always get new paths); rows with any other credit are never read
 * or touched (`scripts/lib/seed-media.ts`).
 *
 * `--photos` downloads the Unsplash photos listed in `scripts/lib/seed-photos.ts` (nothing is
 * committed or written to disk), checks and re-encodes them like an admin upload and credits the
 * photographer on the row. It also replaces drawings an earlier run left, once a usable photo is in
 * hand, but only on rows `seed.sql` created (seeded id at the seed's path; never another row, whatever
 * its credit), in one overwrite. A photo that cannot be used falls back to the
 * drawing for that row and keeps `Sample image`, so the next `--photos` run tries again. Without
 * the flag nothing is fetched and nothing that exists is replaced.
 *
 * Same guard as `seed:users`: a non-local NEXT_PUBLIC_SUPABASE_URL needs `--allow-remote=<exact host>`.
 * It refuses outright when VERCEL_ENV is production or the Supabase host is listed in PRODUCTION_HOSTS.
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (`.env.local` is loaded when present).
 * Prints counts and photo keys only. These are sample images: real photos go in through /admin/media.
 *
 * Like `seed-users.ts`, this file only runs `main()`: no entry-point check, which can silently skip
 * the run on Windows (drive-letter case, junctions, `subst` drives).
 */
import { createClient } from "@supabase/supabase-js";

import { checkTarget, createSupabaseStore, generateSampleImage, seedSampleMedia } from "./lib/seed-media.ts";
import { createPhotoProvider } from "./lib/seed-photos.ts";

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
  const withPhotos = process.argv.includes("--photos");

  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const photos = withPhotos
    ? createPhotoProvider({
        onFailure: (key, reason) =>
          console.warn(`seed:media: photo "${key}" not used (${reason}); drawing it instead.`),
      })
    : undefined;
  const counts = await seedSampleMedia(createSupabaseStore(supabase), generateSampleImage, photos);
  if (withPhotos) {
    const drawings = counts.created - counts.photos;
    console.log(
      `seed:media: photos ${counts.photos}, drawings ${drawings}, photo fallbacks ${counts.fallbacks}, ` +
        `skipped ${counts.skipped}, failed ${counts.failed}`,
    );
  } else {
    console.log(`seed:media: created ${counts.created}, skipped ${counts.skipped}, failed ${counts.failed}`);
  }
  if (counts.failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
