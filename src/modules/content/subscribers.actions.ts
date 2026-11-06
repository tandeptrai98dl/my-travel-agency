"use server";

import { AccessDeniedError } from "@/lib/auth/require-role";

import { exportSubscribers, type ExportResult } from "./subscribers.service";

export async function exportSubscribersAction(): Promise<ExportResult | { ok: false; error: "forbidden" }> {
  try {
    return await exportSubscribers();
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}
