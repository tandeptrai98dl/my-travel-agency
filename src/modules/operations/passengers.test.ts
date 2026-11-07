import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), exportPassengers: vi.fn(), readDashboard: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./passengers.repository", () => ({ exportPassengers: mocks.exportPassengers }));
vi.mock("./dashboard.repository", () => ({ readDashboard: mocks.readDashboard }));

const { exportPassengerList, PASSENGER_COLUMNS } = await import("./passengers.service");
const { getDashboard } = await import("./dashboard.service");

const departureId = "27000000-0000-4000-8000-000000000001";
const lead = {
  full_name: '=HYPERLINK("http://x")',
  date_of_birth: "1990-01-02",
  nationality: "VN",
  dietary_notes: "+chay",
  booking_code: "PTA-2711-0001",
  is_lead: true,
  phone: "+84900002799",
  party: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue({ id: "u", role: "operator" });
  mocks.exportPassengers.mockResolvedValue({ data: [lead, { ...lead, full_name: "Bé Na", is_lead: false, phone: "+84911111111", date_of_birth: null }], error: null });
});

describe("exportPassengerList", () => {
  it("checks the departures permission and builds a CSV without passport numbers, formulas neutralised", async () => {
    const result = await exportPassengerList(departureId);
    expect(mocks.requirePermission).toHaveBeenCalledWith("departures.edit");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [header, first, second] = result.csv.trim().split("\r\n");
    expect(header).toBe(PASSENGER_COLUMNS.map((c) => `"${c}"`).join(","));
    expect(header).not.toMatch(/passport/i);
    expect(first).toBe(`"'=HYPERLINK(""http://x"")","1990-01-02","VN","'+chay","PTA-2711-0001","yes","'+84900002799","3"`);
    // Only the lead's phone is listed.
    expect(second).toBe(`"Bé Na","","VN","'+chay","PTA-2711-0001","","","3"`);
    expect(result.count).toBe(2);
  });

  it("maps the database refusals and never builds a file without the audited read", async () => {
    mocks.exportPassengers.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect(await exportPassengerList(departureId)).toEqual({ ok: false, error: "forbidden" });
    mocks.exportPassengers.mockResolvedValueOnce({ data: null, error: { code: "P0002" } });
    expect(await exportPassengerList(departureId)).toEqual({ ok: false, error: "not_found" });
    mocks.exportPassengers.mockResolvedValueOnce({ data: null, error: { code: "23502" } });
    expect(await exportPassengerList(departureId)).toEqual({ ok: false, error: "failed" });
    expect(await exportPassengerList("not-a-uuid")).toEqual({ ok: false, error: "not_found" });
  });
});

describe("getDashboard", () => {
  it("returns only the sections the database sent and refuses another shape", async () => {
    mocks.readDashboard.mockResolvedValueOnce({ data: { content: { drafts: 1, missing_translations: 2, missing_alt: 0 } }, error: null });
    expect(await getDashboard()).toEqual({ content: { drafts: 1, missing_translations: 2, missing_alt: 0 } });
    expect(mocks.requirePermission).toHaveBeenCalledWith("dashboard.view");
    mocks.readDashboard.mockResolvedValueOnce({ data: { content: { drafts: -1, missing_translations: 0, missing_alt: 0 } }, error: null });
    await expect(getDashboard()).rejects.toThrow();
    mocks.readDashboard.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(getDashboard()).rejects.toThrow("42501");
  });
});
