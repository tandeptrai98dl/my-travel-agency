import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/dates", async (original) => ({
  ...(await original<typeof import("@/lib/dates")>()),
  todayInVietnam: () => "2027-01-10",
}));

type Result = { data: unknown; error: null | { code?: string; message?: string } };
const fn = (data: unknown) => vi.fn(async (...args: unknown[]): Promise<Result> => (void args, { data, error: null }));
const departure = {
  id: "dep-1",
  tour_id: "tour-1",
  start_date: "2027-03-20",
  end_date: "2027-03-22",
  capacity: 12,
  seats_reserved: 4,
  status: "open",
  price_adult: 12_900_000,
  price_child: null,
  price_infant: null,
  single_supplement: 2_500_000,
  tours: { id: "tour-1", status: "published", type: "group", min_pax: 1, max_pax: 10, deposit_percent: 30, balance_due_days: 30 },
};
const repo = {
  findDepartureForBooking: fn(departure),
  findBooking: fn({ id: "b-1", status: "draft", tour_id: "tour-1", departure_id: "dep-1" }),
  bookingCutoffDays: fn(7),
  createDraft: fn("b-1"),
  updateDraft: fn(null),
  reserve: fn({ payment_id: "p-1", reference: "PTA2701000101", amount: 7_740_000, expires_at: "2027-01-10T10:30:00Z", booking_status: "pending_payment" }),
  cancel: fn({ refund_percent: 80, refund_amount: 6_192_000 }),
};
vi.mock("./booking.repository", () => repo);

const service = await import("./booking.service");
const { draftInputSchema } = await import("./booking.schemas");

const input = draftInputSchema.parse({
  idempotencyKey: "0f8fad5b-d9cb-469f-a165-70867728950e",
  departureId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  locale: "vi",
  party: { adults: 2, children: 0, infants: 0, singleRooms: 0 },
  plan: "deposit",
  contact: { name: "Nguyễn Lan", email: "LAN@example.test", phone: "+84 900 000 000" },
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.findDepartureForBooking.mockResolvedValue({ data: departure, error: null });
  repo.findBooking.mockResolvedValue({ data: { id: "b-1", status: "draft", tour_id: "tour-1", departure_id: "dep-1" }, error: null });
});

describe("startDraft", () => {
  it("prices on the server and sends the lines, never a price from the input", async () => {
    const result = await service.startDraft(input, null);
    expect(result).toMatchObject({ ok: true, id: "b-1", quote: { total: 25_800_000, deposit: 7_740_000 } });
    const sent = repo.createDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).toMatchObject({
      idempotency_key: input.idempotencyKey,
      contact_email: "lan@example.test",
      payment_plan: "deposit",
      total: 25_800_000,
      deposit_amount: 7_740_000,
      balance_due_date: "2027-02-18",
      items: [{ type: "adult", unit_price: 12_900_000, quantity: 2, amount: 25_800_000, label: "adult" }],
    });
  });

  it("refuses departures that cannot be booked", async () => {
    repo.findDepartureForBooking.mockResolvedValueOnce({ data: { ...departure, start_date: "2027-01-15" }, error: null });
    expect(await service.startDraft(input, null)).toEqual({ ok: false, error: "departure_closed" });
    repo.findDepartureForBooking.mockResolvedValueOnce({ data: { ...departure, seats_reserved: 11 }, error: null });
    expect(await service.startDraft(input, null)).toEqual({ ok: false, error: "notEnoughSeats" });
    expect(repo.createDraft).not.toHaveBeenCalled();
  });
});

describe("startPayment", () => {
  it("holds seats and refreshes the tour's cached pages", async () => {
    const result = await service.startPayment({ bookingId: "b-1", provider: "vnpay", kind: "deposit" });
    expect(result).toEqual({
      ok: true,
      payment: { paymentId: "p-1", reference: "PTA2701000101", amount: 7_740_000, expiresAt: "2027-01-10T10:30:00Z", bookingStatus: "pending_payment" },
    });
    expect(revalidateTag).toHaveBeenCalledWith("tours", "max");
    expect(revalidateTag).toHaveBeenCalledWith("tour:tour-1", "max");
  });

  it("maps the function errors", async () => {
    for (const message of ["sold_out", "price_changed", "too_many_attempts", "not_payable"]) {
      repo.reserve.mockResolvedValueOnce({ data: null, error: { code: "P0001", message } });
      expect(await service.startPayment({ bookingId: "b-1", provider: "vnpay", kind: "deposit" })).toEqual({ ok: false, error: message });
    }
    repo.reserve.mockResolvedValueOnce({ data: null, error: { code: "P0002", message: "not_found" } });
    expect(await service.startPayment({ bookingId: "b-1", provider: "vnpay", kind: "deposit" })).toEqual({ ok: false, error: "not_found" });
    repo.reserve.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await service.startPayment({ bookingId: "b-1", provider: "vnpay", kind: "deposit" })).toEqual({ ok: false, error: "failed" });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("does not refresh the cache when switching method on a held booking", async () => {
    repo.findBooking.mockResolvedValueOnce({ data: { id: "b-1", status: "pending_payment", tour_id: "tour-1", departure_id: "dep-1" }, error: null });
    await service.startPayment({ bookingId: "b-1", provider: "bank_transfer", kind: "deposit" });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("cancelBooking", () => {
  it("returns the suggested refund and refreshes the tour when seats were released", async () => {
    repo.findBooking.mockResolvedValueOnce({ data: { id: "b-1", status: "confirmed", tour_id: "tour-1", departure_id: "dep-1" }, error: null });
    expect(await service.cancelBooking("b-1", "staff-1", "customer request")).toEqual({ ok: true, refundPercent: 80, refundAmount: 6_192_000 });
    expect(repo.cancel).toHaveBeenCalledWith("b-1", "staff-1", "customer request");
    expect(revalidateTag).toHaveBeenCalledWith("tour:tour-1", "max");
  });
});
