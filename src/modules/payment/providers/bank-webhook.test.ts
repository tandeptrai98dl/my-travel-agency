import { describe, expect, it } from "vitest";

import { authorized, extractReference, parseBankWebhook } from "./bank-webhook";

describe("bank webhook", () => {
  it("checks the SePay API key and the Casso token", () => {
    const secret = "a-long-bank-webhook-secret";
    expect(authorized("sepay", new Headers({ Authorization: `Apikey ${secret}` }), secret)).toBe(true);
    expect(authorized("sepay", new Headers({ Authorization: "Apikey nope" }), secret)).toBe(false);
    expect(authorized("sepay", new Headers({ Authorization: `Bearer ${secret}` }), secret)).toBe(false);
    expect(authorized("casso", new Headers({ "secure-token": secret }), secret)).toBe(true);
    expect(authorized("casso", new Headers(), secret)).toBe(false);
  });

  it("finds the reference in a memo, in any letter case and with bank noise around it", () => {
    expect(extractReference("MBVCB.123456.pta2611004201.CT tu 0011")).toBe("PTA2611004201");
    expect(extractReference("Nguyen Van A chuyen tien PTA2611004201 FT2631")).toBe("PTA2611004201");
    expect(extractReference("tien tour thang 11")).toBeNull();
  });

  it("reads a reference typed with spaces or dashes, without gluing on later numbers", () => {
    expect(extractReference("PTA 2611004201")).toBe("PTA2611004201");
    expect(extractReference("chuyen khoan pta 2611 0042 01 cam on")).toBe("PTA2611004201");
    expect(extractReference("PTA-2611-0042-01")).toBe("PTA2611004201");
    expect(extractReference("PTA2611 004201 0011223344")).toBe("PTA2611004201");
    expect(extractReference("PTA2611004201 0011")).toBe("PTA2611004201");
    expect(extractReference("PTA 2611 0042")).toBeNull();
    expect(extractReference("PTA tour 2611004201")).toBeNull();
    expect(extractReference("CAPTAIN 2611004201")).toBeNull();
  });

  it("maps SePay incoming credits and ignores outgoing transfers", () => {
    const credit = { id: 92704, transferType: "in", transferAmount: 3_870_000, content: "PTA2611004201 thanh toan", referenceCode: "FT26310" };
    expect(parseBankWebhook("sepay", credit)).toMatchObject({
      ignored: 0,
      events: [{ eventKey: "sepay:92704", reference: "PTA2611004201", amount: 3_870_000, providerTxnId: "sepay:92704", succeeded: true }],
    });
    // A refund that quotes the reference must never count as a payment.
    expect(parseBankWebhook("sepay", { ...credit, transferType: "out" })).toEqual({ events: [], ignored: 1 });
    expect(parseBankWebhook("sepay", { ...credit, transferAmount: 10.5 })).toBeNull();
    expect(parseBankWebhook("sepay", { nope: true })).toBeNull();
  });

  it("maps Casso credits only, and an unknown memo to an empty reference (unmatched)", () => {
    const parsed = parseBankWebhook("casso", {
      error: 0,
      data: [
        { id: 1, amount: 1_000_000, description: "chuyen khoan PTA2611004301" },
        { id: 2, amount: -500_000, description: "hoan tien PTA2611004301" },
        { id: 3, amount: 200_000, description: "khong co ma" },
      ],
    });
    expect(parsed?.ignored).toBe(1);
    expect(parsed?.events.map((event) => [event.eventKey, event.reference, event.amount])).toEqual([
      ["casso:1", "PTA2611004301", 1_000_000],
      ["casso:3", "", 200_000],
    ]);
  });
});

// Phase 6 PR 6A (decision 2): Casso's current documentation (developer.casso.vn, webhook v2,
// read 2026-11-07) says only that the configured security key is sent in a header, without naming
// it, and that `data` is an array. Whether it is still `secure-token` or an `X-Casso-Signature`
// HMAC is checked on the first real webhook with the owner's Casso account (owner item 9) and
// recorded in docs/SECURITY_REVIEW.md; SePay also offers an HMAC-SHA256 signature with
// `X-SePay-Timestamp`, a follow-up once its header format can be read from the owner's account.
describe("bank webhook providers (waiting for owner item 9)", () => {
  it.todo("Casso: the authentication header of a real webhook matches authorized()");
});
