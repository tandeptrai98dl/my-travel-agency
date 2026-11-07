import { z } from "zod";

/**
 * The shape of `admin_dashboard()` (spec Phase 5 decision 13): one object with the sections the
 * caller's role may see. A section the role lacks is absent; the database decides.
 */
const count = z.number().int().nonnegative();

export const dashboardSchema = z.object({
  sales: z
    .object({
      scope: z.enum(["own", "team"]),
      new_bookings: count,
      open_inquiries: count,
      unassigned_inquiries: count,
      quotes_awaiting_payment: count,
      median_first_response_minutes: z.number().int().nonnegative().nullable(),
    })
    .optional(),
  operations: z
    .object({
      departures: z.array(
        z.object({
          id: z.string(),
          tour_code: z.string(),
          start_date: z.string(),
          status: z.string(),
          capacity: count,
          seats_reserved: count,
          confirmed: count,
          party: count,
          travellers: count,
          min_pax: z.number().int().nullable(),
        }),
      ),
      below_minimum: count,
      missing_travellers: count,
    })
    .optional(),
  finance: z
    .object({
      revenue_month: z.number().int(),
      payments_expiring: count,
      unmatched_transfers: count,
      money_attention: count,
    })
    .optional(),
  content: z.object({ drafts: count, missing_translations: count, missing_alt: count }).optional(),
  admin: z.object({ deletion_requests: count }).optional(),
});

export type Dashboard = z.infer<typeof dashboardSchema>;
export type DashboardDeparture = NonNullable<Dashboard["operations"]>["departures"][number];
