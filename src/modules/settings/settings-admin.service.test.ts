import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const updateTag = vi.fn();
vi.mock("next/cache", () => ({ updateTag, cacheLife: () => undefined, cacheTag: () => undefined }));
const requirePermission = vi.fn(async () => ({ id: "admin-1", role: "admin" }));
vi.mock("@/lib/auth/require-role", () => ({ requirePermission }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock("@/modules/media/media.service", () => ({ getMediaUrl: (path: string) => `https://cdn/${path}` }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed so tests can assert call arguments
const ok = <T,>(data: T) => vi.fn(async (..._args: unknown[]) => ({ data, error: null as null | { code: string; message: string } }));
const repo = {
  readSettingsRows: ok<{ key: string; value: unknown }[]>([]),
  upsertSetting: ok({ key: "x" }),
  destinationOptions: ok([
    { key: "vietnam", type: "country", status: "published", destination_translations: [{ locale: "vi", name: "Việt Nam" }] },
    { key: "hoi-an", type: "city", status: "published", destination_translations: [] },
    { key: "laos", type: "country", status: "draft", destination_translations: [] },
  ]),
  findMedia: ok<{ id: string; path: string; alt: unknown } | null>(null),
};
vi.mock("./settings.repository", () => repo);

const service = await import("./settings-admin.service");
const { saveSettingsSchema } = await import("./settings.schemas");

const HERO = "7a1d2c4e-1111-4b1a-9c1d-000000000001";
const homepage = (patch: object = {}) =>
  saveSettingsSchema.parse({
    section: "homepage",
    value: {
      hero: { eyebrow: { vi: "", en: "" }, title: { vi: "", en: "" }, media_id: null },
      featured_destination_keys: [],
      journal_teaser_count: 3,
      ...patch,
    },
  });

beforeEach(() => {
  vi.clearAllMocks();
  repo.readSettingsRows.mockResolvedValue({ data: [], error: null });
  repo.findMedia.mockResolvedValue({ data: null, error: null });
});

describe("toEditorValues", () => {
  it("fills missing keys with the ADR-016 defaults", () => {
    const values = service.toEditorValues([]);
    expect(values.booking_rules).toEqual({
      hold_minutes: { vnpay: 30, bank_transfer: 120 },
      balance_reminder_days_before_due: [7, 2],
      booking_lookup_link_minutes: 30,
      booking_cutoff_days: 7,
    });
    expect(values.homepage.hero.media_id).toBeNull();
    expect(values.company.address).toEqual({ vi: "", en: "" });
  });
});

describe("saveSettings", () => {
  it("offers only published countries and regions as homepage picks", async () => {
    const editor = await service.getSettingsEditor();
    expect(editor.destinations).toEqual([{ key: "vietnam", label: "Việt Nam" }]);
    expect(requirePermission).toHaveBeenCalledWith("settings.manage");
  });

  it("refuses a homepage hero without both alt texts and an unknown destination", async () => {
    repo.findMedia.mockResolvedValue({ data: { id: HERO, path: "a.jpg", alt: { vi: "Biển", en: "" } }, error: null });
    expect(await service.saveSettings(homepage({ hero: { eyebrow: {}, title: {}, media_id: HERO } }))).toEqual({
      ok: false,
      error: "heroAltMissing",
      field: "hero.media_id",
    });
    expect(await service.saveSettings(homepage({ featured_destination_keys: ["laos"] }))).toEqual({
      ok: false,
      error: "unknownDestination",
      field: "featured_destination_keys",
    });
    expect(repo.upsertSetting).not.toHaveBeenCalled();
  });

  it("keeps the booking rules the form does not edit and refreshes the settings tag", async () => {
    repo.readSettingsRows.mockResolvedValue({
      data: [{ key: "booking_rules", value: { late_payment: "confirm_if_seats_remain_else_needs_attention", booking_cutoff_days: 7 } }],
      error: null,
    });
    const input = saveSettingsSchema.parse({
      section: "booking_rules",
      value: {
        hold_minutes: { vnpay: 20, bank_transfer: 90 },
        balance_reminder_days_before_due: [7, 2],
        booking_lookup_link_minutes: 30,
        booking_cutoff_days: 10,
      },
    });
    expect(await service.saveSettings(input)).toEqual({ ok: true });
    expect(repo.upsertSetting).toHaveBeenCalledWith({
      key: "booking_rules",
      value: {
        late_payment: "confirm_if_seats_remain_else_needs_attention",
        hold_minutes: { vnpay: 20, bank_transfer: 90 },
        balance_reminder_days_before_due: [7, 2],
        booking_lookup_link_minutes: 30,
        booking_cutoff_days: 10,
      },
      is_public: false,
      updated_by: "admin-1",
    });
    expect(updateTag).toHaveBeenCalledWith("settings");
  });

  it("saves the bank account as private and maps an RLS refusal to forbidden", async () => {
    repo.upsertSetting.mockResolvedValueOnce({ data: null as never, error: { code: "42501", message: "rls" } });
    const input = saveSettingsSchema.parse({
      section: "bank_account",
      value: { bank_name: "VCB", bank_bin: "970436", account_number: "0011", account_holder: "A", branch: "" },
    });
    expect(await service.saveSettings(input)).toEqual({ ok: false, error: "forbidden" });
    expect(repo.upsertSetting.mock.calls[0][0]).toMatchObject({ key: "bank_account", is_public: false });
    expect(updateTag).not.toHaveBeenCalled();
  });
});
