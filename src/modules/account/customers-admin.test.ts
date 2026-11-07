import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  dataExport: vi.fn(),
  writeAuditRow: vi.fn(),
  findCustomer: vi.fn(),
  addNote: vi.fn(),
  finishDeletionAsAdmin: vi.fn(),
}));
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./account-deletion.service", () => ({ finishDeletionAsAdmin: mocks.finishDeletionAsAdmin }));
vi.mock("./customers-admin.repository", () => ({
  dataExport: mocks.dataExport,
  writeAuditRow: mocks.writeAuditRow,
  findCustomer: mocks.findCustomer,
  addNote: mocks.addNote,
}));

const { addCustomerNote, exportCustomerData, finishCustomerDeletion } = await import("./customers-admin.service");
const { cleanCustomerSearch, customerNoteSchema, customerState, exactPattern } = await import("./customers-admin.schemas");

const id = "00000000-0000-4000-8000-000000002707";
const admin = { id: "00000000-0000-4000-8000-000000000a01", role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(admin);
  mocks.dataExport.mockResolvedValue({ data: { profile: { id }, bookings: [{}, {}], travellers: [{}], consents: [], inquiries: [{}] }, error: null });
  mocks.writeAuditRow.mockResolvedValue({ error: null });
  mocks.findCustomer.mockResolvedValue({ data: { id, email: "x@example.test" }, error: null });
  mocks.addNote.mockResolvedValue({ error: null });
});

describe("exportCustomerData", () => {
  it("needs the admin data permission, then writes the audit row with counts before handing out the file", async () => {
    const result = await exportCustomerData(id);
    expect(mocks.requirePermission).toHaveBeenCalledWith("customers.delete_data");
    expect(mocks.writeAuditRow).toHaveBeenCalledWith({
      actor_id: admin.id,
      action: "customers.export",
      entity_type: "profiles",
      entity_id: id,
      changes: { counts: { bookings: 2, travellers: 1, consents: 0, inquiries: 1 } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.json)).toMatchObject({ profile: { id }, bookings: [{}, {}] });
  });

  it("refuses the file when the audit row cannot be written", async () => {
    mocks.writeAuditRow.mockResolvedValue({ error: { code: "42P01" } });
    expect(await exportCustomerData(id)).toEqual({ ok: false, error: "failed" });
  });

  it("reports an unknown or staff profile as not found", async () => {
    mocks.dataExport.mockResolvedValue({ data: null, error: { code: "P0002" } });
    expect(await exportCustomerData(id)).toEqual({ ok: false, error: "not_found" });
    expect(mocks.writeAuditRow).not.toHaveBeenCalled();
  });

  it("stops at the permission check", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("denied"));
    await expect(exportCustomerData(id)).rejects.toThrow("denied");
    expect(mocks.dataExport).not.toHaveBeenCalled();
  });
});

describe("finishCustomerDeletion", () => {
  it("maps the deletion outcomes", async () => {
    mocks.finishDeletionAsAdmin.mockResolvedValueOnce({ status: "done" });
    expect(await finishCustomerDeletion({ customerId: id, note: "Đã trả đủ" })).toEqual({ ok: true, status: "done" });
    mocks.finishDeletionAsAdmin.mockResolvedValueOnce({ status: "blocked", reasons: ["upcoming_trip"] });
    expect(await finishCustomerDeletion({ customerId: id, note: "x" })).toEqual({ ok: false, error: "blocked", reasons: ["upcoming_trip"] });
    mocks.finishDeletionAsAdmin.mockResolvedValueOnce({ status: "failed", step: "soft_delete" });
    expect(await finishCustomerDeletion({ customerId: id, note: "x" })).toEqual({ ok: false, error: "failed", step: "soft_delete" });
    mocks.finishDeletionAsAdmin.mockResolvedValueOnce({ status: "not_requested" });
    expect(await finishCustomerDeletion({ customerId: id, note: "x" })).toEqual({ ok: false, error: "not_requested" });
    expect(mocks.finishDeletionAsAdmin).toHaveBeenCalledWith(id, "Đã trả đủ");
  });
});

describe("addCustomerNote", () => {
  it("writes the note as the staff member on a customer", async () => {
    expect(await addCustomerNote({ customerId: id, body: "Thích phòng tầng cao" })).toEqual({ ok: true });
    expect(mocks.requirePermission).toHaveBeenCalledWith("customers.notes");
    expect(mocks.addNote).toHaveBeenCalledWith({ body: "Thích phòng tầng cao", author_id: admin.id, customer_id: id });
  });

  it("refuses an unknown customer", async () => {
    mocks.findCustomer.mockResolvedValue({ data: null, error: null });
    expect(await addCustomerNote({ customerId: id, body: "abc" })).toEqual({ ok: false, error: "not_found" });
    expect(mocks.addNote).not.toHaveBeenCalled();
  });
});

describe("schemas", () => {
  it("needs a note of 3 to 2000 characters", () => {
    expect(customerNoteSchema.safeParse({ customerId: id, body: " ab " }).error?.issues[0]?.message).toBe("noteRequired");
    expect(customerNoteSchema.safeParse({ customerId: id, body: "x".repeat(2001) }).error?.issues[0]?.message).toBe("tooLong");
  });

  it("drops filter syntax and wildcards from search and escapes an address for ILIKE", () => {
    expect(cleanCustomerSearch("a,b(c)*%_d:e'f")).toBe("a b c d e f");
    expect(exactPattern("an_na%x@example.test")).toBe("an\\_na\\%x@example.test");
  });

  it("derives the account state", () => {
    expect(customerState({ deletion_requested_at: null, deleted_at: null })).toBe("active");
    expect(customerState({ deletion_requested_at: "2026-11-07", deleted_at: null })).toBe("requested");
    expect(customerState({ deletion_requested_at: "2026-11-07", deleted_at: "2026-11-08" })).toBe("deleted");
  });
});
