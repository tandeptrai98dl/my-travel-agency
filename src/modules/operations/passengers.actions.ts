"use server";

import { z } from "zod";

import { AccessDeniedError } from "@/lib/auth/require-role";

import { exportPassengerList, type PassengerExportResult } from "./passengers.service";

const input = z.object({ departureId: z.uuid() });

export async function exportPassengersAction(raw: { departureId: string }): Promise<PassengerExportResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "not_found" };
  try {
    return await exportPassengerList(parsed.data.departureId);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}
