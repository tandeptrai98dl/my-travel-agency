import { publicEnv } from "@/lib/env/public";

/** Absolute base URL for metadata (canonical URLs, Open Graph). */
export const siteUrl = new URL(publicEnv.NEXT_PUBLIC_SITE_URL);
