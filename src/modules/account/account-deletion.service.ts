import "server-only";

import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { checkLimits } from "@/modules/identity/auth-guards";
import type { AuthState, DeleteAccountInput } from "@/modules/identity/customer-auth.schemas";
import { confirmCurrentPassword, signedInUser } from "@/modules/identity/customer-auth.service";

import * as repo from "./account-deletion.repository";

/**
 * Data deletion (spec Phase 5 decision 8; the procedure and the retention period need legal review
 * before launch). Three steps in order, each safe to repeat:
 *   1. ban the Auth user (and revoke the customer's own sessions),
 *   2. anonymise_customer(): every SQL change in one transaction,
 *   3. GoTrue's soft delete of the Auth user.
 * A failed step leaves `deletion_requested_at` set and is logged with its error code only; a retry
 * skips the steps already done (customer_deletion_state()).
 */

export type DeletionStep = "ban" | "anonymise" | "soft_delete";
export type DeletionOutcome = { status: "done" } | { status: "failed"; step: DeletionStep };

type State = { role: string; requested: boolean; profile_deleted: boolean; auth_deleted: boolean };

const HOUR = 3600;

function failed(step: DeletionStep, error: { code?: string; status?: number } | null): DeletionOutcome {
  logger.error("customers.deletion_step_failed", { step, code: error?.code ?? (error?.status ? `HTTP ${error.status}` : null) });
  return { status: "failed", step };
}

export async function runDeletionSteps(
  profileId: string,
  options: { accessToken?: string | null; anonymise?: () => Promise<{ error: { code?: string } | null }> } = {},
): Promise<DeletionOutcome> {
  const { data, error } = await repo.deletionState(profileId);
  if (error || !data) return failed("ban", error);
  const state = data as State;
  if (state.profile_deleted && state.auth_deleted) return { status: "done" };

  if (!state.auth_deleted) {
    const ban = await repo.banUser(profileId);
    if (ban.error) return failed("ban", ban.error);
    if (options.accessToken) {
      const revoked = await repo.revokeSessions(options.accessToken);
      // The ban already stops token refresh; a failed revoke is logged, not fatal.
      if (revoked.error) logger.warn("customers.deletion_revoke_failed", { code: revoked.error.code ?? null });
    }
  }
  if (!state.profile_deleted) {
    const anonymised = options.anonymise ? await options.anonymise() : await repo.anonymise(profileId);
    if (anonymised.error) return failed("anonymise", anonymised.error);
  }
  if (!state.auth_deleted) {
    const deleted = await repo.softDeleteUser(profileId);
    if (deleted.error) return failed("soft_delete", deleted.error);
  }
  logger.info("customers.deleted", {});
  return { status: "done" };
}

/**
 * The customer's own request from the account area: the password again, a limit, the request on
 * record, then the steps at once unless a trip or money is still open (the customer is told so
 * and the request waits for an admin).
 */
export async function requestMyDeletion(input: DeleteAccountInput): Promise<AuthState> {
  // The limit comes before the password check, so a stolen session cannot guess the password here.
  const signedIn = await signedInUser();
  if (!signedIn) return { status: "expired" };
  const limited = await checkLimits([{ scope: "deletion", id: signedIn.id, limit: 5, window: HOUR }]);
  if (limited !== "ok") return { status: limited };
  const user = await confirmCurrentPassword(input.current);
  if (user === "expired") return { status: "expired" };
  if (user === "rate_limited") return { status: "rate_limited" };
  if (user === "invalid") return { status: "invalid", errors: { current: "wrongPassword" } };

  const { data: reasons, error } = await repo.requestDeletion(user.id);
  if (error) {
    // Staff accounts (P0002) are not deleted here; everything else is a failure to record.
    if (error.code === "P0002") return { status: "unavailable" };
    logger.error("customers.deletion_request_failed", { code: error.code ?? null });
    return { status: "failed" };
  }
  if ((reasons ?? []).length > 0) return { status: "deletion_pending" };

  const outcome = await runDeletionSteps(user.id, { accessToken: user.accessToken });
  // Banned or not, this browser's session ends here.
  const signedOut = await repo.signOutHere();
  if (signedOut.error) logger.warn("customers.deletion_signout_failed", { code: signedOut.error.code ?? null });
  return { status: outcome.status === "done" ? "deleted" : "received" };
}

export type AdminDeletionOutcome = DeletionOutcome | { status: "forbidden" | "not_requested" } | { status: "blocked"; reasons: string[] };

/**
 * An MFA-verified admin finishes a request that had to wait (the customers page, PR 5D), once
 * nothing blocks it any more (`blocked` with the reasons otherwise; the database refuses too).
 * The SQL step goes through admin_anonymise_customer(), which checks the role, the request, the
 * blockers and the note. A retry after a failed step runs only the steps still to do.
 */
export async function finishDeletionAsAdmin(profileId: string, note: string): Promise<AdminDeletionOutcome> {
  await requirePermission("customers.delete_data");
  const { data, error } = await repo.deletionState(profileId);
  if (error || !data) return failed("ban", error);
  const state = data as State;
  if (state.role !== "customer" || !state.requested) return { status: "not_requested" };
  if (!state.profile_deleted) {
    const blockers = await repo.deletionBlockers(profileId);
    if (blockers.error) return failed("ban", blockers.error);
    if ((blockers.data ?? []).length > 0) return { status: "blocked", reasons: blockers.data ?? [] };
  }
  return runDeletionSteps(profileId, {
    anonymise: async () => {
      const { error: wrapperError } = await repo.anonymiseAsAdmin(profileId, note);
      return { error: wrapperError };
    },
  });
}
