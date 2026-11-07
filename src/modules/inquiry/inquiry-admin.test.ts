import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  assign: vi.fn(),
  updateStatus: vi.fn(),
  addNote: vi.fn(),
  findInquiryByCode: vi.fn(),
}));
vi.mock("@/lib/auth/require-role", () => {
  class AccessDeniedError extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  }
  return { requirePermission: mocks.requirePermission, AccessDeniedError };
});
vi.mock("./inquiry-admin.repository", () => ({
  assign: mocks.assign,
  updateStatus: mocks.updateStatus,
  addNote: mocks.addNote,
  findInquiryByCode: mocks.findInquiryByCode,
}));
vi.mock("@/lib/dates", () => ({ todayInVietnam: () => "2026-11-07" }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const schemas = await import("./inquiry-admin.schemas");
const service = await import("./inquiry-admin.service");
const actions = await import("./inquiry-admin.actions");
const { AccessDeniedError } = await import("@/lib/auth/require-role");

const inquiryId = "25000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue({ id: "00000000-0000-4000-8000-000000002501", role: "sales" });
  for (const fn of [mocks.assign, mocks.updateStatus, mocks.addNote]) fn.mockResolvedValue({ data: null, error: null });
});

describe("inquiry inbox rules", () => {
  it("never lets staff set an inquiry back to new", () => {
    expect(schemas.inquiryStatusSchema.safeParse({ inquiryId, status: "new" }).success).toBe(false);
    expect(schemas.inquiryStatusSchema.parse({ inquiryId, status: "contacted" })).toEqual({ inquiryId, status: "contacted", note: "" });
  });

  it("requires a real note and a boolean contact flag", () => {
    expect(schemas.inquiryNoteSchema.safeParse({ inquiryId, body: " ok " }).error?.issues[0]?.message).toBe("noteRequired");
    expect(schemas.inquiryNoteSchema.safeParse({ inquiryId, body: "x".repeat(2001) }).error?.issues[0]?.message).toBe("tooLong");
    expect(schemas.inquiryNoteSchema.parse({ inquiryId, body: " Called her " })).toEqual({ inquiryId, body: "Called her", contacted: false });
  });

  it("accepts a staff id or nobody as the owner", () => {
    expect(schemas.inquiryAssignSchema.safeParse({ inquiryId, assignee: "" }).success).toBe(true);
    expect(schemas.inquiryAssignSchema.safeParse({ inquiryId, assignee: "someone" }).success).toBe(false);
  });

  it("maps database errors to message keys", () => {
    expect(schemas.inquiryErrorCode({ code: "42501" })).toBe("forbidden");
    expect(schemas.inquiryErrorCode({ code: "P0002" })).toBe("not_found");
    expect(schemas.inquiryErrorCode({ code: "P0001", message: "note_required" })).toBe("note_required");
    expect(schemas.inquiryErrorCode({ code: "22023", message: "invalid_assignee" })).toBe("invalid_assignee");
    expect(schemas.inquiryErrorCode({ code: "22023", message: "invalid_status" })).toBe("invalid_status");
    expect(schemas.inquiryErrorCode({ code: "XX000", message: "boom" })).toBe("failed");
  });

  it("reads the owner filter, with staff ids for managers only", () => {
    expect(schemas.ownerFilter("mine", false)).toEqual({ kind: "mine" });
    expect(schemas.ownerFilter("unassigned", false)).toEqual({ kind: "unassigned" });
    expect(schemas.ownerFilter(inquiryId, false)).toEqual({ kind: "all" });
    expect(schemas.ownerFilter(inquiryId, true)).toEqual({ kind: "user", id: inquiryId });
    expect(schemas.ownerFilter("1,assigned_to.is.null", true)).toEqual({ kind: "all" });
  });

  it("measures the time to the first response", () => {
    expect(schemas.responseTime("2026-11-07T09:00:00Z", null)).toBeNull();
    expect(schemas.responseTime("2026-11-07T09:00:00Z", "2026-11-08T12:30:00Z")).toBe(27.5 * 3_600_000);
    expect(schemas.formatDuration(27.5 * 3_600_000)).toEqual({ days: 1, hours: 3, minutes: 30 });
    expect(schemas.formatDuration(45 * 60_000)).toEqual({ days: 0, hours: 0, minutes: 45 });
  });

  it("starts a quote on the travel month's first day only when it is ahead", () => {
    expect(schemas.quoteStartDate("2027-03", "2026-11-07")).toBe("2027-03-01");
    expect(schemas.quoteStartDate("2026-11", "2026-11-07")).toBeNull();
    expect(schemas.quoteStartDate("2027-13", "2026-11-07")).toBeNull();
    expect(schemas.quoteStartDate(null, "2026-11-07")).toBeNull();
  });
});

describe("inquiry inbox actions", () => {
  it("checks the permission before reading the input", async () => {
    mocks.requirePermission.mockRejectedValue(new AccessDeniedError("forbidden"));
    expect(await actions.addInquiryNoteAction({ nonsense: true })).toEqual({ ok: false, error: "forbidden" });
    expect(mocks.requirePermission).toHaveBeenCalledWith("inquiries.edit");
    expect(mocks.addNote).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input", async () => {
    expect(await actions.updateInquiryStatusAction({ inquiryId, status: "new" })).toMatchObject({ ok: false, error: "invalid", fields: { status: expect.any(String) } });
    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });

  it("passes nobody as null and maps refusals from the function", async () => {
    expect(await actions.assignInquiryAction({ inquiryId, assignee: "" })).toEqual({ ok: true });
    expect(mocks.assign).toHaveBeenCalledWith(inquiryId, null);
    mocks.assign.mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } });
    expect(await actions.assignInquiryAction({ inquiryId, assignee: "" })).toEqual({ ok: false, error: "forbidden" });
  });

  it("sends the note and the contact flag to the function", async () => {
    expect(await actions.addInquiryNoteAction({ inquiryId, body: "Phoned Anna", contacted: true })).toEqual({ ok: true });
    expect(mocks.addNote).toHaveBeenCalledWith(inquiryId, "Phoned Anna", true);
    expect(await actions.updateInquiryStatusAction({ inquiryId, status: "lost", note: "Went elsewhere" })).toEqual({ ok: true });
    expect(mocks.updateStatus).toHaveBeenCalledWith(inquiryId, "lost", "Went elsewhere");
  });
});

describe("quote prefill", () => {
  const row = {
    id: inquiryId,
    code: "INQ-2611-0042",
    name: "Anna Berg",
    email: "anna@example.com",
    phone: null,
    locale: "en",
    adults: 3,
    children: 1,
    travel_month: "2027-03",
    tour: { id: "t-1", type: "private", status: "published" },
    booking: null,
  };

  it("fills the quote form from an inquiry the caller can see", async () => {
    mocks.findInquiryByCode.mockResolvedValue({ data: row, error: null });
    expect(await service.quotePrefill("inq-2611-0042")).toEqual({
      inquiryCode: "INQ-2611-0042",
      contactName: "Anna Berg",
      contactEmail: "anna@example.com",
      contactPhone: "",
      adults: 3,
      children: 1,
      locale: "en",
      tourId: "t-1",
      startDate: "2027-03-01",
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith("bookings.edit");
    expect(mocks.findInquiryByCode).toHaveBeenCalledWith("INQ-2611-0042");
  });

  it("leaves out group tours and gives nothing for a quoted, hidden or malformed inquiry", async () => {
    mocks.findInquiryByCode.mockResolvedValue({ data: { ...row, adults: null, tour: { id: "t-2", type: "group", status: "published" } }, error: null });
    expect(await service.quotePrefill("INQ-2611-0042")).toMatchObject({ tourId: null, adults: 2 });
    mocks.findInquiryByCode.mockResolvedValue({ data: { ...row, booking: { id: "b-1" } }, error: null });
    expect(await service.quotePrefill("INQ-2611-0042")).toBeNull();
    mocks.findInquiryByCode.mockResolvedValue({ data: null, error: null });
    expect(await service.quotePrefill("INQ-2611-0042")).toBeNull();
    mocks.findInquiryByCode.mockClear();
    expect(await service.quotePrefill("INQ-2611-0042,code.neq.x")).toBeNull();
    expect(mocks.findInquiryByCode).not.toHaveBeenCalled();
  });
});
