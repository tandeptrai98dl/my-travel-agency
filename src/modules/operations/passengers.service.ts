import "server-only";

import { z } from "zod";

import { requirePermission } from "@/lib/auth/require-role";
import { toCsv } from "@/lib/csv";
import { logger } from "@/lib/logger";

import * as repo from "./passengers.repository";

/**
 * Passenger list CSV of a departure (spec Phase 5 decision 14; FEATURES "Departures"): travellers
 * of confirmed and completed bookings, never passport numbers (ADR-016, none are stored), the
 * contact phone of the lead only, spreadsheet formulas neutralised (`toCsv`, as the subscriber
 * export). The database writes `departures.passenger_export` (actor, departure, row count) in the
 * same transaction before it returns a row, so no audit row means no file.
 */
const passengerRows = z.array(
  z.object({
    full_name: z.string(),
    date_of_birth: z.string().nullable(),
    nationality: z.string().nullable(),
    dietary_notes: z.string().nullable(),
    booking_code: z.string(),
    is_lead: z.boolean(),
    phone: z.string().nullable(),
    party: z.number().int(),
  }),
);

export const PASSENGER_COLUMNS = ["full_name", "date_of_birth", "nationality", "dietary_notes", "booking_code", "lead", "lead_phone", "party_size"] as const;

export type PassengerExportResult =
  | { ok: true; csv: string; filename: string; count: number }
  | { ok: false; error: "forbidden" | "not_found" | "failed" };

export function passengersCsv(rows: z.infer<typeof passengerRows>): string {
  return toCsv(
    [...PASSENGER_COLUMNS],
    rows.map((row) => [row.full_name, row.date_of_birth, row.nationality, row.dietary_notes, row.booking_code, row.is_lead ? "yes" : "", row.is_lead ? row.phone : null, row.party]),
  );
}

export async function exportPassengerList(departureId: string): Promise<PassengerExportResult> {
  await requirePermission("departures.edit");
  if (!z.uuid().safeParse(departureId).success) return { ok: false, error: "not_found" };
  const { data, error } = await repo.exportPassengers(departureId);
  if (error) {
    if (error.code === "42501") return { ok: false, error: "forbidden" };
    if (error.code === "P0002") return { ok: false, error: "not_found" };
    logger.error("departures.passenger_export_failed", { code: error.code ?? null });
    return { ok: false, error: "failed" };
  }
  const rows = passengerRows.parse(data ?? []);
  return { ok: true, csv: passengersCsv(rows), filename: `passengers-${departureId.slice(0, 8)}.csv`, count: rows.length };
}
