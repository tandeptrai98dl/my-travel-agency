import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { code?: string; message?: string } | null; count?: number | null };
const repo = vi.hoisted(() => {
  const ok = (data: unknown = null) => vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data, error: null }));
  return {
    listDepartureRows: ok([]),
    listTourOptions: ok([]),
    findTourForDepartures: ok(null),
    latestDeparturePrices: ok(null),
    existingStartDates: ok([]),
    insertDepartures: ok([]),
  };
});
const user = vi.hoisted(() => ({ current: { id: "u1", role: "operator" } }));
vi.mock("./departures.repository", () => repo);
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: vi.fn(async () => user.current) }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/modules/catalog/tours/tours.service", () => ({ TOURS_TAG: "tours", tourTag: (id: string) => `tour:${id}` }));
vi.mock("@/lib/dates", async (original) => ({
  ...(await original<typeof import("@/lib/dates")>()),
  todayInVietnam: () => "2026-11-07",
}));

const { requirePermission } = await import("@/lib/auth/require-role");
const { updateTag } = await import("next/cache");
const service = await import("./departures.service");

const TOUR = "0f8fad5b-d9cb-469f-a165-70867728950e";
const row = (overrides: Record<string, unknown> = {}) => ({
  id: "d1",
  tour_id: TOUR,
  start_date: "2026-12-05",
  end_date: "2026-12-07",
  capacity: 16,
  seats_reserved: 4,
  status: "open",
  price_adult: 12900000,
  note: null,
  tours: {
    code: "VN-HLB-03",
    type: "group",
    status: "published",
    tour_translations: [
      { locale: "en", title: "Ha Long Bay Cruise" },
      { locale: "vi", title: "Du thuyền vịnh Hạ Long" },
    ],
  },
  ...overrides,
});

const tourRow = (overrides: Record<string, unknown> = {}) => ({
  id: TOUR,
  code: "VN-HLB-03",
  type: "group",
  status: "published",
  duration_days: 3,
  max_pax: 16,
  tour_translations: [{ locale: "vi", title: "Du thuyền vịnh Hạ Long" }],
  ...overrides,
});
const LATEST = { price_adult: 12900000, price_child: 9675000, price_infant: 1290000, single_supplement: 3225000 };
const plan = (overrides: Record<string, unknown> = {}) => ({
  tourId: TOUR,
  mode: "weekly" as const,
  from: "2026-12-05",
  to: "2026-12-19",
  weekdays: [6],
  dates: "",
  capacity: 14,
  status: "open" as const,
  note: null,
  prices: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  user.current = { id: "u1", role: "operator" };
  repo.findTourForDepartures.mockResolvedValue({ data: tourRow(), error: null });
  repo.latestDeparturePrices.mockResolvedValue({ data: LATEST, error: null });
  repo.existingStartDates.mockResolvedValue({ data: [], error: null });
});

describe("departure list", () => {
  it("covers one month when a month is chosen, otherwise today onwards", () => {
    expect(service.dateRange({ month: "2028-02" }, "2026-11-07")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(service.dateRange({}, "2026-11-07")).toEqual({ from: "2026-11-07" });
  });

  it("reads with the tours permission and maps rows with the Vietnamese title", async () => {
    repo.listDepartureRows.mockResolvedValueOnce({ data: [row()], error: null, count: 26 });
    const result = await service.listDepartures({ filters: { status: "open", tourId: TOUR }, sort: "start_date", dir: "asc", page: 2 });
    expect(requirePermission).toHaveBeenCalledWith("tours.read");
    expect(repo.listDepartureRows).toHaveBeenCalledWith(
      expect.objectContaining({ status: "open", tourId: TOUR, sort: "start_date", ascending: true, range: [25, 49] }),
    );
    expect(result.pageCount).toBe(2);
    expect(result.items[0]).toMatchObject({ tourCode: "VN-HLB-03", tourTitle: "Du thuyền vịnh Hạ Long", seatsReserved: 4, capacity: 16 });
  });

  it("groups a month by start date and says when the calendar is cut short", async () => {
    repo.listDepartureRows.mockResolvedValueOnce({
      data: [row(), row({ id: "d2", tour_id: "t2" }), row({ id: "d3", start_date: "2026-12-19" })],
      error: null,
      count: 3,
    });
    const month = await service.departureMonth("2026-12", {});
    expect(repo.listDepartureRows).toHaveBeenCalledWith(expect.objectContaining({ from: "2026-12-01", to: "2026-12-31" }));
    expect(Object.keys(month.byDate)).toEqual(["2026-12-05", "2026-12-19"]);
    expect(month.byDate["2026-12-05"]).toHaveLength(2);
    expect(month.truncated).toBe(false);

    repo.listDepartureRows.mockResolvedValueOnce({ data: [], error: null, count: service.CALENDAR_LIMIT + 1 });
    expect((await service.departureMonth("2026-12", {})).truncated).toBe(true);
  });

  it("fails loudly when the database read fails", async () => {
    repo.listDepartureRows.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(service.listDepartures({ filters: {}, sort: "start_date", dir: "asc", page: 1 })).rejects.toThrow("boom");
  });
});

describe("bulk creation", () => {
  it("previews the dates with return dates from the tour's duration and marks existing ones", async () => {
    repo.existingStartDates.mockResolvedValueOnce({ data: [{ start_date: "2026-12-12" }], error: null });
    const preview = await service.previewDepartures(plan());
    expect(requirePermission).toHaveBeenCalledWith("departures.edit");
    expect(preview).toMatchObject({
      ok: true,
      priceSource: "latest",
      prices: { priceAdult: 12900000, singleSupplement: 3225000 },
      rows: [
        { startDate: "2026-12-05", endDate: "2026-12-07", exists: false },
        { startDate: "2026-12-12", endDate: "2026-12-14", exists: true },
        { startDate: "2026-12-19", endDate: "2026-12-21", exists: false },
      ],
    });
  });

  it("ignores prices sent by an operator and copies the latest departure's", async () => {
    const preview = await service.previewDepartures(
      plan({ prices: { priceAdult: 1, priceChild: null, priceInfant: null, singleSupplement: null } }),
    );
    expect(preview).toMatchObject({ ok: true, priceSource: "latest", prices: { priceAdult: 12900000 } });
  });

  it("uses an admin's prices, and needs them for a tour's first departure", async () => {
    user.current = { id: "a1", role: "admin" };
    const prices = { priceAdult: 15000000, priceChild: null, priceInfant: null, singleSupplement: null };
    expect(await service.previewDepartures(plan({ prices }))).toMatchObject({ ok: true, priceSource: "entered", prices });
    repo.latestDeparturePrices.mockResolvedValue({ data: null, error: null });
    expect(await service.previewDepartures(plan())).toEqual({ ok: false, error: "pricesRequired", field: "prices.priceAdult" });
  });

  it("tells an operator that a tour's first departure needs an admin", async () => {
    repo.latestDeparturePrices.mockResolvedValue({ data: null, error: null });
    expect(await service.previewDepartures(plan())).toEqual({ ok: false, error: "firstNeedsAdmin", field: "tourId" });
  });

  it("refuses private and archived tours and dates in the past", async () => {
    repo.findTourForDepartures.mockResolvedValueOnce({ data: tourRow({ type: "private" }), error: null });
    expect(await service.previewDepartures(plan())).toMatchObject({ ok: false, error: "tourNotGroup" });
    repo.findTourForDepartures.mockResolvedValueOnce({ data: tourRow({ status: "archived" }), error: null });
    expect(await service.previewDepartures(plan())).toMatchObject({ ok: false, error: "tourArchived" });
    expect(await service.previewDepartures(plan({ mode: "dates", dates: "01/11/2026\n2026-12-01" }))).toEqual({
      ok: false,
      error: "pastDate",
      field: "dates",
      invalid: ["2026-11-01"],
    });
  });

  it("creates only the new dates and reports the skipped ones, then refreshes the tour tags", async () => {
    repo.existingStartDates.mockResolvedValueOnce({ data: [{ start_date: "2026-12-12" }], error: null });
    // 2026-12-19 was created by someone else between the preview and the insert.
    repo.insertDepartures.mockResolvedValueOnce({ data: [{ start_date: "2026-12-05" }], error: null });
    const result = await service.createDepartures(plan());
    expect(result).toEqual({ ok: true, tourId: TOUR, created: ["2026-12-05"], skipped: ["2026-12-12", "2026-12-19"] });
    const rows = repo.insertDepartures.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows.map((row) => row.start_date)).toEqual(["2026-12-05", "2026-12-19"]);
    expect(rows[0]).toMatchObject({ end_date: "2026-12-07", capacity: 14, status: "open", price_adult: 12900000 });
    expect(updateTag).toHaveBeenCalledWith("tours");
    expect(updateTag).toHaveBeenCalledWith(`tour:${TOUR}`);
  });

  it("writes nothing when every date exists", async () => {
    repo.existingStartDates.mockResolvedValueOnce({
      data: [{ start_date: "2026-12-05" }, { start_date: "2026-12-12" }, { start_date: "2026-12-19" }],
      error: null,
    });
    expect(await service.createDepartures(plan())).toMatchObject({ ok: true, created: [], skipped: ["2026-12-05", "2026-12-12", "2026-12-19"] });
    expect(repo.insertDepartures).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("maps the price guard's refusal of a first departure", async () => {
    repo.insertDepartures.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "the first departure of a tour is created by an admin" },
    });
    expect(await service.createDepartures(plan())).toEqual({ ok: false, error: "firstNeedsAdmin", field: "tourId" });
  });
});
