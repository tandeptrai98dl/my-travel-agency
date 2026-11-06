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

/** The first token that looks like a payment reference (PTA + digits), in any letter case. */
export function extractReference(memo: string): string | null {
  const tokens = memo.toUpperCase().split(/[^A-Z0-9]+/);
  return tokens.find((token) => /^PTA\d{10,}$/.test(token)) ?? null;
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
