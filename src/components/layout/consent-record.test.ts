import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ record: vi.fn(), store: new Map<string, string>() }));
vi.mock("@/modules/consent/consent.actions", () => ({ recordConsentChoice: mocks.record }));

import { CONSENT_RETRY_KEY } from "@/lib/consent";

import { recordChoice, retryPendingChoices } from "./consent-record";

const ID = "0f8b9c1e-2d3a-4b5c-8d6e-7f8091a2b3c4";
const choice = { analytics: true, marketing: false };

beforeEach(() => {
  mocks.store.clear();
  mocks.record.mockReset();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => mocks.store.get(key) ?? null,
      setItem: (key: string, value: string) => mocks.store.set(key, value),
      removeItem: (key: string) => mocks.store.delete(key),
    },
  });
});

describe("consent record fail mode", () => {
  it("keeps the record pending during the request, and nothing once it is written", async () => {
    let pendingDuringRequest: string | undefined;
    mocks.record.mockImplementation(async () => {
      // A full page load now would still find the record and retry it.
      pendingDuringRequest = mocks.store.get(CONSENT_RETRY_KEY);
      return { status: "recorded" };
    });
    await recordChoice(ID, "custom", choice, "vi");
    expect(JSON.parse(pendingDuringRequest!)).toEqual([{ id: ID, action: "custom", analytics: true, marketing: false, locale: "vi" }]);
    expect(mocks.record).toHaveBeenCalledWith({ id: ID, action: "custom", analytics: true, marketing: false, locale: "vi" });
    expect(mocks.store.has(CONSENT_RETRY_KEY)).toBe(false);
  });

  it("keeps a failed or refused record for one retry on the next page view", async () => {
    mocks.record.mockResolvedValueOnce({ status: "unavailable" }).mockRejectedValueOnce(new Error("offline"));
    await recordChoice(ID, "custom", choice, "vi");
    await recordChoice(ID, "withdraw", { analytics: false, marketing: false }, "vi");
    expect(JSON.parse(mocks.store.get(CONSENT_RETRY_KEY)!)).toHaveLength(2);

    mocks.record.mockResolvedValue({ status: "failed" });
    await retryPendingChoices();
    expect(mocks.record).toHaveBeenCalledTimes(4);
    // Retried once only: still failing, nothing is kept for another try.
    expect(mocks.store.has(CONSENT_RETRY_KEY)).toBe(false);
    await retryPendingChoices();
    expect(mocks.record).toHaveBeenCalledTimes(4);
  });

  it("keeps at most three pending records", async () => {
    mocks.record.mockResolvedValue({ status: "failed" });
    for (let i = 0; i < 5; i += 1) await recordChoice(ID, "custom", choice, "en");
    expect(JSON.parse(mocks.store.get(CONSENT_RETRY_KEY)!)).toHaveLength(3);
  });
});
