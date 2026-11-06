import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { GatewayEvent } from "../provider";

/**
 * Bank-transfer reconciliation webhooks (ADR-013, docs/specs/phase-4-booking-payments.md
 * decision 6): SePay or Casso. Only incoming credits become events (SePay transferType "in",
 * Casso amount > 0); outgoing transfers that quote a reference are ignored, so a refund can never
 * count as a payment.
 */

export type BankProvider = "sepay" | "casso";

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** SePay sends `Authorization: Apikey <key>`; Casso sends `secure-token: <token>`. */
export function authorized(provider: BankProvider, headers: Headers, secret: string): boolean {
  if (provider === "sepay") {
    const value = headers.get("authorization") ?? "";
    const match = /^Apikey\s+(.+)$/i.exec(value.trim());
    return Boolean(match) && sameSecret(match![1], secret);
  }
  return sameSecret(headers.get("secure-token") ?? "", secret);
}

/** References are PTA plus at least 10 digits (booking code without dashes and a 2-digit attempt). */
const REFERENCE_DIGITS = 10;

/**
 * The first payment reference in a memo, in any letter case, ignoring spaces and punctuation
 * inside it (spec decision 5): "PTA 2611 0042 01" and "pta-2611-004201" both read as
 * PTA2611004201. Digit groups after a "PTA" token are joined only until the reference is long
 * enough, so a later number in the memo (an account, a bank's own code) is never glued on.
 */
export function extractReference(memo: string): string | null {
  const tokens = memo.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const start = /^PTA(\d*)$/.exec(tokens[i]);
    if (!start) continue;
    let digits = start[1];
    for (let j = i + 1; digits.length < REFERENCE_DIGITS && j < tokens.length && /^\d+$/.test(tokens[j]); j++) {
      digits += tokens[j];
    }
    if (digits.length >= REFERENCE_DIGITS) return `PTA${digits}`;
  }
  return null;
}

const sepaySchema = z.object({
  id: z.union([z.number().int(), z.string().min(1).max(64)]),
  transferType: z.string(),
  transferAmount: z.number().int(),
  content: z.string().max(1000).nullish(),
  description: z.string().max(1000).nullish(),
  referenceCode: z.string().max(100).nullish(),
});

const cassoSchema = z.object({
  error: z.number().int().optional(),
  data: z
    .array(
      z.object({
        id: z.union([z.number().int(), z.string().min(1).max(64)]),
        tid: z.string().max(100).nullish(),
        amount: z.number().int(),
        description: z.string().max(1000).nullish(),
      }),
    )
    .max(100),
});

export type ParsedWebhook = { events: GatewayEvent[]; ignored: number } | null;

export function parseBankWebhook(provider: BankProvider, body: unknown): ParsedWebhook {
  if (provider === "sepay") {
    const parsed = sepaySchema.safeParse(body);
    if (!parsed.success) return null;
    const tx = parsed.data;
    if (tx.transferType !== "in" || tx.transferAmount <= 0) return { events: [], ignored: 1 };
    const memo = `${tx.content ?? ""} ${tx.description ?? ""}`;
    return {
      ignored: 0,
      events: [
        {
          eventKey: `sepay:${tx.id}`,
          reference: extractReference(memo) ?? "",
          amount: tx.transferAmount,
          providerTxnId: `sepay:${tx.id}`,
          succeeded: true,
          payload: { id: tx.id, transferType: tx.transferType, transferAmount: tx.transferAmount, content: tx.content ?? null, referenceCode: tx.referenceCode ?? null },
        },
      ],
    };
  }
  const parsed = cassoSchema.safeParse(body);
  if (!parsed.success) return null;
  const credits = parsed.data.data.filter((tx) => tx.amount > 0);
  return {
    ignored: parsed.data.data.length - credits.length,
    events: credits.map((tx) => ({
      eventKey: `casso:${tx.id}`,
      reference: extractReference(tx.description ?? "") ?? "",
      amount: tx.amount,
      providerTxnId: `casso:${tx.id}`,
      succeeded: true,
      payload: { id: tx.id, tid: tx.tid ?? null, amount: tx.amount, description: tx.description ?? null },
    })),
  };
}
