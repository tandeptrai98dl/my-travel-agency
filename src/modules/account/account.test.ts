import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth/get-user", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u1", role: "customer" })) }));
vi.mock("@/modules/identity/customer-auth.service", () => ({ verifiedUser: vi.fn() }));
vi.mock("@/modules/content/public/content-public.service", () => ({ getPrivacyConsent: vi.fn(async () => ({ href: "/p", version: "privacy-vi-x" })) }));
const repo = {
  listBookings: vi.fn(),
  getBooking: vi.fn(),
  saveTravellers: vi.fn(async () => ({ data: 1, error: null })),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  setMarketingConsent: vi.fn(async () => ({ data: null, error: null })),
};
vi.mock("./account.repository", () => repo);

const service = await import("./account.service");
const actions = await import("./account.actions");

const detail = {
  code: "PTA-2611-0042",
  status: "confirmed",
  payment_state: "deposit_paid",
  type: "instant",
  locale: "vi",
  tour_code: "VN-1",
  tour_title: "Vịnh Hạ Long",
  start_date: "2027-03-01",
  end_date: "2027-03-03",
  adults: 2,
  children: 1,
  infants: 0,
  single_rooms: 0,
  contact_name: "A",
  contact_email: "a@example.test",
  contact_phone: "+84",
  total: 30_000_000,
  deposit_amount: 9_000_000,
  amount_paid: 9_000_000,
  payment_plan: "deposit",
  balance_due_date: "2027-01-30",
  created_at: "2026-11-07T00:00:00Z",
  cancellation_summary: { vi: "Hoàn 80%", en: "80% back" },
  travellers_editable: true,
  items: [{ type: "adult", label: "Người lớn", unit_price: 10_000_000, quantity: 3, amount: 30_000_000 }],
  travellers: [],
  payments: [{ amount: 9_000_000, kind: "deposit", provider: "vnpay", status: "succeeded", paid_at: "2026-11-07T01:00:00Z", created_at: "2026-11-07T00:59:00Z" }],
};

beforeEach(() => vi.clearAllMocks());

describe("customer bookings", () => {
  it("splits upcoming and past by Vietnam's date and status", async () => {
    repo.listBookings.mockResolvedValueOnce({
      data: [
        { code: "A", status: "confirmed", payment_state: "paid", tour_code: "T", tour_title: "T", start_date: "2026-11-08", end_date: null, adults: 1, children: 0, infants: 0, total: 1, amount_paid: 1, balance_due_date: null, created_at: "" },
        { code: "B", status: "cancelled", payment_state: "unpaid", tour_code: "T", tour_title: "T", start_date: "2027-01-01", end_date: null, adults: 1, children: 1, infants: 1, total: 1, amount_paid: 0, balance_due_date: null, created_at: "" },
        { code: "C", status: "completed", payment_state: "paid", tour_code: "T", tour_title: "T", start_date: "2026-10-01", end_date: null, adults: 1, children: 0, infants: 0, total: 1, amount_paid: 1, balance_due_date: null, created_at: "" },
      ],
      error: null,
    });
    // 2026-11-07 18:00 UTC is already 2026-11-08 in Vietnam.
    const list = await service.listMyBookings(new Date("2026-11-07T18:00:00Z"));
    expect(list.map((b) => [b.code, b.upcoming])).toEqual([
      ["A", true],
      ["B", false],
      ["C", false],
    ]);
    expect(list[1].travellers).toBe(3);
  });

  it("maps the detail and offers the balance payment", async () => {
    repo.getBooking.mockResolvedValueOnce({ data: detail, error: null });
    const booking = await service.getMyBooking("PTA-2611-0042", "en");
    expect(booking).toMatchObject({ balanceDue: 21_000_000, payable: true, cancellationSummary: "80% back", maxTravellers: 3 });
    expect(Object.keys(booking!)).not.toContain("needsAttention");
  });

  it("refuses odd codes without a query and treats a shape mismatch as not found", async () => {
    expect(await service.getMyBooking("../x", "vi")).toBeNull();
    expect(repo.getBooking).not.toHaveBeenCalled();
    repo.getBooking.mockResolvedValueOnce({ data: { ...detail, status: "odd" }, error: null });
    expect(await service.getMyBooking("PTA-2611-0042", "vi")).toBeNull();
  });

  it("maps the travellers function's errors", () => {
    expect(service.mapTravellersError(null)).toBe("saved");
    expect(service.mapTravellersError({ code: "P0001", message: "travellers_locked" })).toBe("locked");
    expect(service.mapTravellersError({ code: "22023", message: "too_many_travellers" })).toBe("too_many");
    expect(service.mapTravellersError({ code: "22023", message: "lead_required" })).toBe("lead_required");
    expect(service.mapTravellersError({ code: "22023", message: "invalid_traveller" })).toBe("invalid");
    expect(service.mapTravellersError({ code: "P0002", message: "not_found" })).toBe("not_found");
    expect(service.mapTravellersError({ code: "XX000", message: "boom" })).toBe("failed");
  });

  it("falls back to the other language's policy summary", () => {
    expect(service.summaryFor({ vi: "Hoàn" }, "en")).toBe("Hoàn");
    expect(service.summaryFor(null, "vi")).toBeNull();
  });
});

describe("travellers action", () => {
  const form = (rows: [string, string][], lead: string) => {
    const data = new FormData();
    data.set("code", "PTA-2611-0042");
    data.set("lead", lead);
    for (const [name, nationality] of rows) {
      data.append("fullName", name);
      data.append("dateOfBirth", "");
      data.append("nationality", nationality);
      data.append("dietaryNotes", "");
    }
    return data;
  };

  it("drops empty rows and keeps the chosen lead on the kept rows", async () => {
    const state = await actions.saveTravellersAction({ status: "idle" }, form([["", ""], ["Hai", "VN"], ["Ba", ""]], "2"));
    expect(state.status).toBe("saved");
    expect(repo.saveTravellers).toHaveBeenCalledWith("PTA-2611-0042", [
      expect.objectContaining({ full_name: "Hai", nationality: "VN", is_lead: false }),
      expect.objectContaining({ full_name: "Ba", nationality: null, is_lead: true }),
    ]);
  });

  it("asks for a lead when the chosen row was empty", async () => {
    const state = await actions.saveTravellersAction({ status: "idle" }, form([["", ""], ["Hai", ""]], "0"));
    expect(state.status).toBe("lead_required");
    expect(repo.saveTravellers).not.toHaveBeenCalled();
  });

  it("puts field errors on their row", async () => {
    const data = form([["Hai", ""]], "0");
    data.set("dateOfBirth", "01/02/1990");
    const state = await actions.saveTravellersAction({ status: "idle" }, data);
    expect(state).toEqual({ status: "invalid", errors: { "0.dateOfBirth": "invalidDate" } });
  });
});
