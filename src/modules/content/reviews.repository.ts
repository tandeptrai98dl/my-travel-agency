import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];

/** Reviews with the staff session (RLS: editor and admin moderate; every staff role reads). */
const db = createClient;

export async function listReviewRows(params: {
  status?: Tables["reviews"]["Row"]["status"];
  verified?: boolean;
  sort: string;
  ascending: boolean;
  range: [number, number];
}) {
  let query = (await db())
    .from("reviews")
    .select(
      "id, tour_id, author_name, author_country, rating, title, content, locale, travel_date, is_verified, status, is_featured, created_at, tours(code)",
      { count: "exact" },
    )
    .order(params.sort, { ascending: params.ascending })
    .order("id")
    .range(params.range[0], params.range[1]);
  if (params.status) query = query.eq("status", params.status);
  if (params.verified !== undefined) query = query.eq("is_verified", params.verified);
  return query;
}

export async function findReview(id: string) {
  return (await db()).from("reviews").select("id, tour_id, status, is_featured").eq("id", id).maybeSingle();
}

export async function updateReview(id: string, row: Pick<Tables["reviews"]["Update"], "status" | "is_featured">) {
  return (await db()).from("reviews").update(row).eq("id", id).select("id").maybeSingle();
}

export type ReviewRow = NonNullable<Awaited<ReturnType<typeof listReviewRows>>["data"]>[number];
