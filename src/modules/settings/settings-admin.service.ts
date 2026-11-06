import "server-only";

import { updateTag } from "next/cache";

import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { readAlt } from "@/modules/media/media.schemas";
import { getMediaUrl } from "@/modules/media/media.service";
import type { Json } from "@/types/database.types";

import * as repo from "./settings.repository";
import {
  BOOKING_CUTOFF_DEFAULT,
  PUBLIC_SETTINGS,
  type SaveSettingsValues,
  SETTINGS_SECTIONS,
  type SettingsInput,
} from "./settings.schemas";
import { SETTINGS_TAG } from "./settings.service";

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const loc = (value: unknown) => ({ vi: str(obj(value).vi), en: str(obj(value).en) });

/** Stored JSON (any shape) → form values; missing keys get the ADR-016 defaults. */
export function toEditorValues(rows: { key: string; value: unknown }[]): SettingsInput {
  const get = (key: string) => obj(rows.find((row) => row.key === key)?.value);
  const company = get("company");
  const contact = get("contact");
  const social = get("social");
  const bank = get("bank_account");
  const rules = get("booking_rules");
  const home = get("homepage");
  const hero = obj(home.hero);
  const hold = obj(rules.hold_minutes);
  const reminders = Array.isArray(rules.balance_reminder_days_before_due)
    ? rules.balance_reminder_days_before_due.filter((day): day is number => typeof day === "number")
    : [7, 2];
  return {
    company: {
      name: str(company.name),
      legal_name: str(company.legal_name),
      tax_code: str(company.tax_code),
      tour_operator_licence: str(company.tour_operator_licence),
      ecommerce_notification_url: str(company.ecommerce_notification_url),
      address: loc(company.address),
    },
    contact: {
      phone: str(contact.phone),
      email: str(contact.email),
      zalo: str(contact.zalo),
      whatsapp: str(contact.whatsapp),
      office_hours: loc(contact.office_hours),
    },
    social: { facebook: str(social.facebook), instagram: str(social.instagram), youtube: str(social.youtube), tiktok: str(social.tiktok) },
    bank_account: {
      bank_name: str(bank.bank_name),
      bank_bin: str(bank.bank_bin),
      account_number: str(bank.account_number),
      account_holder: str(bank.account_holder),
      branch: str(bank.branch),
    },
    booking_rules: {
      hold_minutes: { vnpay: num(hold.vnpay, 30), bank_transfer: num(hold.bank_transfer, 120) },
      balance_reminder_days_before_due: reminders.length ? reminders : [7, 2],
      booking_lookup_link_minutes: num(rules.booking_lookup_link_minutes, 30),
      booking_cutoff_days: num(rules.booking_cutoff_days, BOOKING_CUTOFF_DEFAULT),
    },
    homepage: {
      hero: { eyebrow: loc(hero.eyebrow), title: loc(hero.title), media_id: typeof hero.media_id === "string" ? hero.media_id : null },
      featured_destination_keys: Array.isArray(home.featured_destination_keys)
        ? home.featured_destination_keys.filter((key): key is string => typeof key === "string")
        : [],
      journal_teaser_count: num(home.journal_teaser_count, 3),
    },
  };
}

export type HeroImage = { id: string; url: string; alt: string; altComplete: boolean } | null;
export type SettingsEditorData = {
  values: SettingsInput;
  heroImage: HeroImage;
  destinations: { key: string; label: string }[];
};

async function heroImage(id: string | null): Promise<HeroImage> {
  if (!id) return null;
  const { data } = await repo.findMedia(id);
  if (!data) return null;
  const alt = readAlt(data.alt);
  return { id: data.id, url: getMediaUrl(data.path), alt: alt.vi || alt.en, altComplete: Boolean(alt.vi.trim() && alt.en.trim()) };
}

export async function getSettingsEditor(): Promise<SettingsEditorData> {
  await requirePermission("settings.manage");
  const [{ data, error }, destinations] = await Promise.all([repo.readSettingsRows(SETTINGS_SECTIONS), repo.destinationOptions()]);
  if (error) throw new Error(`settings query failed: ${error.message}`);
  const values = toEditorValues(data ?? []);
  return {
    values,
    heroImage: await heroImage(values.homepage.hero.media_id ?? null),
    // Homepage picks are published countries and regions (the editorial split shows a few large cards).
    destinations: (destinations.data ?? [])
      .filter((row) => row.status === "published" && row.type !== "city")
      .map((row) => ({ key: row.key, label: row.destination_translations.find((t) => t.locale === "vi")?.name ?? row.key })),
  };
}

export type SaveSettingsResult = { ok: true } | { ok: false; error: string; field?: string };

/** Saves one section (step 21); booking rules keep the ADR-016 values the form does not show. */
export async function saveSettings(input: SaveSettingsValues): Promise<SaveSettingsResult> {
  const user = await requirePermission("settings.manage");
  let value: Raw = input.value as Raw;
  if (input.section === "homepage") {
    const id = input.value.hero.media_id;
    if (id) {
      const image = await heroImage(id);
      if (!image) return { ok: false, error: "not_found", field: "hero.media_id" };
      // Decision 6: an image shown on the public homepage needs both alt texts.
      if (!image.altComplete) return { ok: false, error: "heroAltMissing", field: "hero.media_id" };
    }
    const { data } = await repo.destinationOptions();
    const known = new Set((data ?? []).filter((row) => row.status === "published").map((row) => row.key));
    const unknown = input.value.featured_destination_keys.find((key) => !known.has(key));
    if (unknown) return { ok: false, error: "unknownDestination", field: "featured_destination_keys" };
  }
  if (input.section === "booking_rules") {
    const { data } = await repo.readSettingsRows(["booking_rules"]);
    value = { ...obj(data?.[0]?.value), ...input.value };
  }
  const { error } = await repo.upsertSetting({
    key: input.section,
    value: value as NonNullable<Json>,
    is_public: PUBLIC_SETTINGS[input.section],
    updated_by: user.id,
  });
  if (error) {
    logger.error("settings.write_failed", { section: input.section, code: error.code, message: error.message });
    return { ok: false, error: error.code === "42501" ? "forbidden" : "failed" };
  }
  updateTag(SETTINGS_TAG);
  return { ok: true };
}
