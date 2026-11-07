import "server-only";

import { requirePermission } from "@/lib/auth/require-role";

import * as repo from "./dashboard.repository";
import { type Dashboard, dashboardSchema } from "./dashboard.schemas";

/** The figures of `/admin` for the signed-in staff member's role (spec Phase 5 decision 13). */
export async function getDashboard(): Promise<Dashboard> {
  await requirePermission("dashboard.view");
  const { data, error } = await repo.readDashboard();
  if (error) throw new Error(`dashboard query failed: ${error.code ?? "unknown"}`);
  return dashboardSchema.parse(data ?? {});
}
