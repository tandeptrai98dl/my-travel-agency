import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { code?: string; message?: string } | null; count?: number | null };
const repo = vi.hoisted(() => {
  const ok = (data: unknown = null) => vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data, error: null }));
  return {
    listDepartureRows: ok([]),
    listTourOptions: ok([]),
  };
});
const user = vi.hoisted(() => ({ current: { id: "u1", role: "operator" } }));
vi.mock("./departures.repository", () => repo);
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: vi.fn(async () => user.current) }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));

const { requirePermission } = await import("@/lib/auth/require-role");
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

beforeEach(() => {
  vi.clearAllMocks();
  user.current = { id: "u1", role: "operator" };
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
