import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  features: { booking: true },
  enabled: true,
  methods: ["vnpay"] as string[] | Error,
}));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/features", () => ({ features: mocks.features }));
vi.mock("@/modules/booking/checkout.service", () => ({ bookingEnabled: () => mocks.enabled }));
vi.mock("@/modules/payment/payment.service", () => ({
  availableMethods: async () => {
    if (mocks.methods instanceof Error) throw mocks.methods;
    return mocks.methods;
  },
}));
vi.mock("@/modules/settings/settings.service", () => ({ SETTINGS_TAG: "settings" }));

import { onlineBookingAvailable } from "./online-booking.service";

beforeEach(() => {
  mocks.features.booking = true;
  mocks.enabled = true;
  mocks.methods = ["vnpay"];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("onlineBookingAvailable", () => {
  it("is true with the switch on, the checkout key and a payment method", async () => {
    expect(await onlineBookingAvailable()).toBe(true);
    mocks.methods = ["bank_transfer"];
    expect(await onlineBookingAvailable()).toBe(true);
  });

  it("is false when any of the three is missing, or on an error", async () => {
    mocks.methods = [];
    expect(await onlineBookingAvailable()).toBe(false);
    mocks.methods = ["vnpay"];
    mocks.enabled = false;
    expect(await onlineBookingAvailable()).toBe(false);
    mocks.enabled = true;
    mocks.features.booking = false;
    expect(await onlineBookingAvailable()).toBe(false);
    mocks.features.booking = true;
    mocks.methods = new Error("settings down");
    expect(await onlineBookingAvailable()).toBe(false);
  });
});
