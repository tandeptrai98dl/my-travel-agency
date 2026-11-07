import "server-only";

import { updateTag } from "next/cache";

import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { emptyRichText, richTextIsEmpty, richTextMediaIds } from "@/lib/rich-text";
import { getPathname } from "@/i18n/navigation";
import { readAlt } from "@/modules/media/media.schemas";
import { syncSlugRedirect } from "@/modules/content/redirects.service";
import { getMediaUrl } from "@/modules/media/media.service";
import { scheduleLanguageRedirects } from "@/modules/content/language-redirects.service";

import { CANCELLATION_POLICIES_TAG, TRAVEL_STYLES_TAG } from "../cache-tags";
import { DESTINATIONS_TAG } from "../destinations.service";

import * as repo from "./taxonomy.repository";
import {
  type CancellationPolicyInput,
  type CancellationPolicyValues,
  type ContentLocale,
  type DestinationInput,
  type DestinationValues,
  LOCALES,
  type TravelStyleInput,
  type TravelStyleValues,
} from "./taxonomy.schemas";

/** Cache tags for public travel-style and policy reads (Phase 3 pages read them). */
export { CANCELLATION_POLICIES_TAG, TRAVEL_STYLES_TAG };

export type SaveError =
  | "key_locked"
  | "key_taken"
  | "slug_taken"
  | "invalid_parent"
  | "slugInvalid"
  | "requiredToPublish"
  | "default_required"
  | "hero_alt_missing"
  | "contentImageAlt"
  | "not_found"
  | "failed";
export type SaveResult = { ok: true; id: string; warning?: "default_not_moved" } | { ok: false; error: SaveError; field?: string };
export type DeleteResult = { ok: true } | { ok: false; error: "in_use" | "is_default" | "not_found" | "failed" };

type LocaleState = { exists: boolean; published: boolean };
export type HeroSummary = { id: string; url: string; alt: string; altComplete: boolean } | null;

function localeStates(rows: { locale: string; is_published: boolean }[]): Record<ContentLocale, LocaleState> {
  const state = (locale: ContentLocale) => {
    const row = rows.find((r) => r.locale === locale);
    return { exists: Boolean(row), published: Boolean(row?.is_published) };
  };
  return { vi: state("vi"), en: state("en") };
}

async function heroSummary(id: string | null): Promise<HeroSummary> {
  if (!id) return null;
  const { data } = await repo.findMediaSummary(id);
  if (!data) return null;
  const alt = readAlt(data.alt);
  return { id: data.id, url: getMediaUrl(data.path), alt: alt.vi || alt.en, altComplete: Boolean(alt.vi.trim() && alt.en.trim()) };
}

async function checkHero(status: string, heroMediaId: string | null): Promise<SaveResult | null> {
  if (status !== "published" || !heroMediaId) return null;
  const hero = await heroSummary(heroMediaId);
  return hero?.altComplete ? null : { ok: false, error: "hero_alt_missing", field: "heroMediaId" };
}

/** Postgres error → form error (unique slug or key, tree rule). */
function mapWriteError(
  error: { code?: string; message?: string; details?: string } | null,
  locale?: ContentLocale,
  bodyField: "summary" | "description" = "summary",
): SaveResult {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if (error?.code === "23505" && text.includes("slug")) {
    return { ok: false, error: "slug_taken", field: `translations.${locale ?? "vi"}.slug` };
  }
  if (error?.code === "23505" && text.includes("one_default")) return { ok: false, error: "failed" };
  if (error?.code === "23505" && text.includes("_key_key")) return { ok: false, error: "key_taken", field: "key" };
  if (error?.code === "23514" && text.includes("key of a published")) {
    return { ok: false, error: "key_locked", field: "key" };
  }
  if (error?.code === "23514" && text.includes("another default")) {
    return { ok: false, error: "default_required", field: "isDefault" };
  }
  // Database rules (supabase/migrations/*_taxonomy_rules.sql) that the form checks first; these
  // only fire when the page was out of date (e.g. a parent changed type meanwhile).
  if (error?.code === "23514" && text.includes("slug_format")) {
    return { ok: false, error: "slugInvalid", field: `translations.${locale ?? "vi"}.slug` };
  }
  if (error?.code === "23514" && text.includes("published translation")) {
    return { ok: false, error: "requiredToPublish", field: `translations.${locale ?? "vi"}.${bodyField}` };
  }
  if (error?.code === "23514" && /parent|sit under|its children|change the type/.test(text)) {
    return { ok: false, error: "invalid_parent", field: "parentId" };
  }
  logger.error("taxonomy.write_failed", { code: error?.code, message: error?.message });
  return { ok: false, error: "failed" };
}

type PathKind = "destination" | "travelStyle";
function publicPath(kind: PathKind, locale: ContentLocale, slug: string): string {
  const pathname = kind === "destination" ? "/destinations/[slug]" : "/travel-styles/[slug]";
  return getPathname({ href: { pathname, params: { slug } }, locale });
}

/**
 * A published translation serves its path again: a redirect left there by an earlier slug change
 * or removal would shadow it, since the proxy reads Redis before the page (as tours do, #22).
 */
async function clearRedirectFrom(kind: PathKind, locale: ContentLocale, slug: string) {
  const path = publicPath(kind, locale, slug);
  const cleared = await repo.deleteRedirectFrom(path);
  if (cleared.error) logger.error("taxonomy.redirect_clear_failed", { kind, locale, message: cleared.error.message });
  else if (cleared.data?.length) await syncSlugRedirect(path);
}

/** Decision 4: a published translation whose slug changes gets a 301 from its old path. */
async function redirectIfSlugChanged(
  kind: PathKind,
  locale: ContentLocale,
  before: { locale: string; slug: string; is_published: boolean }[],
  nextSlug: string,
) {
  const old = before.find((row) => row.locale === locale);
  if (!old?.is_published || old.slug === nextSlug) return;
  const to = publicPath(kind, locale, nextSlug);
  const { error } = await repo.saveRedirect(publicPath(kind, locale, old.slug), to);
  if (error) logger.error("taxonomy.redirect_failed", { kind, locale, message: error.message });
  else await syncSlugRedirect(to);
}

/** Free slug for this kind and language (the editor checks on blur; saving checks again). */
export async function isSlugAvailable(input: { kind: PathKind; locale: ContentLocale; slug: string; excludeId?: string }) {
  await requirePermission("content.manage");
  const { ownerId, error } = await repo.findSlugOwner(input.kind, input.locale, input.slug);
  if (error) throw new Error(`slug lookup failed: ${error.message}`);
  return ownerId === null || ownerId === input.excludeId;
}

// Destinations ------------------------------------------------------------------------------------------

export type DestinationListItem = {
  id: string;
  key: string;
  type: "country" | "region" | "city";
  parentId: string | null;
  status: "draft" | "published" | "archived";
  name: string;
  locales: Record<ContentLocale, LocaleState>;
  children: DestinationListItem[];
};

export async function listDestinations(): Promise<DestinationListItem[]> {
  await requirePermission("content.manage");
  const { data, error } = await repo.listDestinationRows();
  if (error) throw new Error(`destinations query failed: ${error.message}`);
  const items: DestinationListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    type: row.type,
    parentId: row.parent_id,
    status: row.status,
    name: row.destination_translations.find((t) => t.locale === "vi")?.name ?? row.key,
    locales: localeStates(row.destination_translations),
    children: [],
  }));
  const byId = new Map(items.map((item) => [item.id, item]));
  const roots: DestinationListItem[] = [];
  for (const item of items) {
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    (parent ? parent.children : roots).push(item);
  }
  return roots;
}

/** Preview data for images inside the rich text (the JSON keeps only their ids). */
export type ContentMedia = Record<string, { url: string; alt: string }>;
export type DestinationDetail = { values: DestinationInput; hero: HeroSummary; contentMedia: ContentMedia };

async function contentMediaRows(ids: string[]) {
  if (ids.length === 0) return [];
  const { data, error } = await repo.findMediaRows([...new Set(ids)]);
  if (error) throw new Error(`media query failed: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id, url: getMediaUrl(row.path), alt: readAlt(row.alt) }));
}

const emptyDestinationTranslation = {
  slug: "",
  name: "",
  summary: "",
  bestTimeToVisit: "",
  content: emptyRichText(),
  seoTitle: "",
  seoDescription: "",
  isPublished: false,
};

export function newDestinationValues(parent?: { id: string; type: "country" | "region" | "city" }): DestinationInput {
  return {
    key: "",
    type: parent ? (parent.type === "country" ? "region" : "city") : "country",
    parentId: parent?.id ?? null,
    status: "draft",
    heroMediaId: null,
    latitude: null,
    longitude: null,
    sortOrder: 0,
    translations: { vi: { ...emptyDestinationTranslation }, en: { ...emptyDestinationTranslation } },
  };
}

export async function getDestination(id: string): Promise<DestinationDetail | null> {
  await requirePermission("content.manage");
  const { data, error } = await repo.findDestination(id);
  if (error) throw new Error(`destination query failed: ${error.message}`);
  if (!data) return null;
  const translation = (locale: ContentLocale) => {
    const row = data.destination_translations.find((t) => t.locale === locale);
    return row
      ? {
          slug: row.slug,
          name: row.name,
          summary: row.summary ?? "",
          bestTimeToVisit: row.best_time_to_visit ?? "",
          content: row.content ?? emptyRichText(),
          seoTitle: row.seo_title ?? "",
          seoDescription: row.seo_description ?? "",
          isPublished: row.is_published,
        }
      : { ...emptyDestinationTranslation, content: emptyRichText() };
  };
  const vi = translation("vi");
  const en = translation("en");
  const media = await contentMediaRows([...richTextMediaIds(vi.content), ...richTextMediaIds(en.content)]);
  return {
    values: {
      id: data.id,
      key: data.key,
      type: data.type,
      parentId: data.parent_id,
      status: data.status,
      heroMediaId: data.hero_media_id,
      latitude: data.latitude,
      longitude: data.longitude,
      sortOrder: data.sort_order,
      translations: { vi, en },
    },
    hero: await heroSummary(data.hero_media_id),
    contentMedia: Object.fromEntries(media.map((item) => [item.id, { url: item.url, alt: item.alt.vi || item.alt.en }])),
  };
}

export async function saveDestination(values: DestinationValues): Promise<SaveResult> {
  await requirePermission("content.manage");
  const existing = values.id ? (await repo.findDestination(values.id)).data : null;
  if (values.id && !existing) return { ok: false, error: "not_found" };
  // The key is in public filter URLs (ADR-016): fixed once the destination has been published.
  if (existing && existing.status === "published" && existing.key !== values.key) {
    return { ok: false, error: "key_locked", field: "key" };
  }
  const heroProblem = await checkHero(values.status, values.heroMediaId);
  if (heroProblem) return heroProblem;
  // Decision 6: images in a language being published need both alt texts.
  for (const locale of LOCALES) {
    const t = values.translations[locale];
    if (!t.name || !t.isPublished) continue;
    const ids = richTextMediaIds(t.content);
    const rows = await contentMediaRows(ids);
    if (ids.some((mediaId) => !rows.find((item) => item.id === mediaId && item.alt.vi.trim() && item.alt.en.trim()))) {
      return { ok: false, error: "contentImageAlt", field: `translations.${locale}.content` };
    }
  }

  const row = {
    key: values.key,
    type: values.type,
    parent_id: values.type === "country" ? null : values.parentId,
    status: values.status,
    hero_media_id: values.heroMediaId,
    latitude: values.latitude,
    longitude: values.longitude,
    sort_order: values.sortOrder,
  };
  const saved = existing ? await repo.updateDestination(existing.id, row) : await repo.insertDestination(row);
  if (saved.error || !saved.data) return mapWriteError(saved.error);
  const id = saved.data.id;
  // A new destination whose translation fails is removed again, so a retry is not "key taken".
  // An existing one keeps what was saved, so the public tree is refreshed either way.
  const fail = async (result: SaveResult) => {
    if (existing) {
      updateTag(DESTINATIONS_TAG);
      scheduleLanguageRedirects();
    }
    else await repo.deleteDestinationRow(id);
    return result;
  };

  for (const locale of LOCALES) {
    const t = values.translations[locale];
    if (!t.name) {
      const { error } = await repo.deleteDestinationTranslation(id, locale);
      if (error) return fail(mapWriteError(error, locale));
      continue;
    }
    const { error } = await repo.upsertDestinationTranslation({
      destination_id: id,
      locale,
      slug: t.slug,
      name: t.name,
      summary: t.summary,
      best_time_to_visit: t.bestTimeToVisit,
      // An empty editor is stored as nothing, so public pages fall back to the summary.
      content: richTextIsEmpty(t.content) ? null : t.content,
      seo_title: t.seoTitle,
      seo_description: t.seoDescription,
      is_published: t.isPublished,
    });
    if (error) return fail(mapWriteError(error, locale, "summary"));
    // Right after this language is saved, so a later failure cannot lose the redirect.
    if (t.isPublished) await clearRedirectFrom("destination", locale, t.slug);
    if (existing) await redirectIfSlugChanged("destination", locale, existing.destination_translations, t.slug);
  }
  updateTag(DESTINATIONS_TAG);
  scheduleLanguageRedirects();
  return { ok: true, id };
}

export async function deleteDestination(id: string): Promise<DeleteResult> {
  await requirePermission("content.manage");
  const uses = await repo.countDestinationUses(id);
  if (uses.error) return { ok: false, error: "failed" };
  if (uses.children > 0 || uses.tours > 0) return { ok: false, error: "in_use" };
  const { error } = await repo.deleteDestinationRow(id);
  if (error) return { ok: false, error: error.code === "23503" ? "in_use" : "failed" };
  updateTag(DESTINATIONS_TAG);
  scheduleLanguageRedirects();
  return { ok: true };
}

/** Options for the parent field: countries and regions with their Vietnamese names. */
export async function listParentOptions() {
  const tree = await listDestinations();
  const options: { id: string; type: "country" | "region"; label: string }[] = [];
  for (const country of tree) {
    options.push({ id: country.id, type: "country", label: country.name });
    for (const region of country.children) {
      if (region.type === "region") options.push({ id: region.id, type: "region", label: `${country.name} › ${region.name}` });
    }
  }
  return options;
}

// Travel styles -----------------------------------------------------------------------------------------

export type TravelStyleListItem = {
  id: string;
  key: string;
  status: "draft" | "published" | "archived";
  sortOrder: number;
  name: string;
  locales: Record<ContentLocale, LocaleState>;
};

export async function listTravelStyles(): Promise<TravelStyleListItem[]> {
  await requirePermission("content.manage");
  const { data, error } = await repo.listTravelStyleRows();
  if (error) throw new Error(`travel styles query failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    status: row.status,
    sortOrder: row.sort_order,
    name: row.travel_style_translations.find((t) => t.locale === "vi")?.name ?? row.key,
    locales: localeStates(row.travel_style_translations),
  }));
}

const emptyStyleTranslation = { slug: "", name: "", description: "", seoTitle: "", seoDescription: "", isPublished: false };

export function newTravelStyleValues(): TravelStyleInput {
  return {
    key: "",
    status: "draft",
    heroMediaId: null,
    sortOrder: 0,
    translations: { vi: { ...emptyStyleTranslation }, en: { ...emptyStyleTranslation } },
  };
}

export async function getTravelStyle(id: string): Promise<{ values: TravelStyleInput; hero: HeroSummary } | null> {
  await requirePermission("content.manage");
  const { data, error } = await repo.findTravelStyle(id);
  if (error) throw new Error(`travel style query failed: ${error.message}`);
  if (!data) return null;
  const translation = (locale: ContentLocale) => {
    const row = data.travel_style_translations.find((t) => t.locale === locale);
    return row
      ? {
          slug: row.slug,
          name: row.name,
          description: row.description ?? "",
          seoTitle: row.seo_title ?? "",
          seoDescription: row.seo_description ?? "",
          isPublished: row.is_published,
        }
      : { ...emptyStyleTranslation };
  };
  return {
    values: {
      id: data.id,
      key: data.key,
      status: data.status,
      heroMediaId: data.hero_media_id,
      sortOrder: data.sort_order,
      translations: { vi: translation("vi"), en: translation("en") },
    },
    hero: await heroSummary(data.hero_media_id),
  };
}

export async function saveTravelStyle(values: TravelStyleValues): Promise<SaveResult> {
  await requirePermission("content.manage");
  const existing = values.id ? (await repo.findTravelStyle(values.id)).data : null;
  if (values.id && !existing) return { ok: false, error: "not_found" };
  if (existing && existing.status === "published" && existing.key !== values.key) {
    return { ok: false, error: "key_locked", field: "key" };
  }
  const heroProblem = await checkHero(values.status, values.heroMediaId);
  if (heroProblem) return heroProblem;

  const row = { key: values.key, status: values.status, hero_media_id: values.heroMediaId, sort_order: values.sortOrder };
  const saved = existing ? await repo.updateTravelStyle(existing.id, row) : await repo.insertTravelStyle(row);
  if (saved.error || !saved.data) return mapWriteError(saved.error);
  const id = saved.data.id;
  const fail = async (result: SaveResult) => {
    if (existing) {
      updateTag(TRAVEL_STYLES_TAG);
      scheduleLanguageRedirects();
    }
    else await repo.deleteTravelStyleRow(id);
    return result;
  };

  for (const locale of LOCALES) {
    const t = values.translations[locale];
    if (!t.name) {
      const { error } = await repo.deleteTravelStyleTranslation(id, locale);
      if (error) return fail(mapWriteError(error, locale));
      continue;
    }
    const { error } = await repo.upsertTravelStyleTranslation({
      travel_style_id: id,
      locale,
      slug: t.slug,
      name: t.name,
      description: t.description,
      seo_title: t.seoTitle,
      seo_description: t.seoDescription,
      is_published: t.isPublished,
    });
    if (error) return fail(mapWriteError(error, locale, "description"));
    if (t.isPublished) await clearRedirectFrom("travelStyle", locale, t.slug);
    if (existing) await redirectIfSlugChanged("travelStyle", locale, existing.travel_style_translations, t.slug);
  }
  updateTag(TRAVEL_STYLES_TAG);
  scheduleLanguageRedirects();
  return { ok: true, id };
}

export async function deleteTravelStyle(id: string): Promise<DeleteResult> {
  await requirePermission("content.manage");
  const uses = await repo.countTravelStyleUses(id);
  if (uses.error) return { ok: false, error: "failed" };
  if (uses.tours > 0) return { ok: false, error: "in_use" };
  const { error } = await repo.deleteTravelStyleRow(id);
  if (error) return { ok: false, error: error.code === "23503" ? "in_use" : "failed" };
  updateTag(TRAVEL_STYLES_TAG);
  scheduleLanguageRedirects();
  return { ok: true };
}

// Cancellation policies (admin) ------------------------------------------------------------------------

export type CancellationPolicyItem = {
  id: string;
  name: string;
  version: number;
  isDefault: boolean;
  rules: { minDaysBefore: number; refundPercent: number }[];
  summary: { vi: string; en: string };
  tourCount: number;
};

function readRules(value: unknown): CancellationPolicyItem["rules"] {
  return Array.isArray(value)
    ? value.map((rule) => ({
        minDaysBefore: Number((rule as Record<string, unknown>).min_days_before),
        refundPercent: Number((rule as Record<string, unknown>).refund_percent),
      }))
    : [];
}

export async function listCancellationPolicies(): Promise<CancellationPolicyItem[]> {
  await requirePermission("settings.manage");
  const { policies, tours } = await repo.listCancellationPolicyRows();
  if (policies.error) throw new Error(`policies query failed: ${policies.error.message}`);
  const counts = new Map<string, number>();
  for (const tour of tours.data ?? []) {
    if (tour.cancellation_policy_id) counts.set(tour.cancellation_policy_id, (counts.get(tour.cancellation_policy_id) ?? 0) + 1);
  }
  return (policies.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    version: row.version,
    isDefault: row.is_default,
    rules: readRules(row.rules),
    summary: { vi: readAlt(row.summary).vi, en: readAlt(row.summary).en },
    tourCount: counts.get(row.id) ?? 0,
  }));
}

/**
 * Saves a policy. Editing raises its version: bookings keep their own snapshot (ADR-011), and
 * the audit log keeps the before/after rules.
 */
export async function saveCancellationPolicy(values: CancellationPolicyValues): Promise<SaveResult> {
  await requirePermission("settings.manage");
  const existing = values.id ? (await repo.findCancellationPolicy(values.id)).data : null;
  if (values.id && !existing) return { ok: false, error: "not_found" };
  // New tours take the default (decision 1): it can be replaced by another, never just removed.
  if (existing?.is_default && !values.isDefault) {
    return { ok: false, error: "default_required", field: "isDefault" };
  }
  const row = {
    name: values.name,
    rules: values.rules.map((rule) => ({ min_days_before: rule.minDaysBefore, refund_percent: rule.refundPercent })),
    summary: values.summary,
    // The flag moves separately, in one transaction (set_default_cancellation_policy).
    is_default: existing?.is_default ?? false,
  };
  const saved = existing
    ? await repo.updateCancellationPolicy(existing.id, { ...row, version: existing.version + 1 })
    : await repo.insertCancellationPolicy(row);
  if (saved.error || !saved.data) return mapWriteError(saved.error);
  const id = saved.data.id;
  if (values.isDefault && !existing?.is_default) {
    const moved = await repo.setDefaultCancellationPolicy(id);
    if (moved.error) {
      updateTag(CANCELLATION_POLICIES_TAG);
      // The policy itself was saved: return its id so the editor moves to it (no duplicate on retry).
      const failure = mapWriteError(moved.error);
      return existing ? failure : { ok: true, id, warning: "default_not_moved" };
    }
  }
  updateTag(CANCELLATION_POLICIES_TAG);
  return { ok: true, id };
}

export function newCancellationPolicyValues(): CancellationPolicyInput {
  // One rule covering every cancellation; the editor adds earlier, more generous tiers above it.
  return { name: "", rules: [{ minDaysBefore: 0, refundPercent: 0 }], summary: { vi: "", en: "" }, isDefault: false };
}

export async function getCancellationPolicy(
  id: string,
): Promise<{ values: CancellationPolicyInput; version: number; tourCount: number } | null> {
  await requirePermission("settings.manage");
  const { data, error } = await repo.findCancellationPolicy(id);
  if (error) throw new Error(`policy query failed: ${error.message}`);
  if (!data) return null;
  const uses = await repo.countPolicyTours(id);
  const summary = readAlt(data.summary);
  return {
    values: { id: data.id, name: data.name, rules: readRules(data.rules), summary, isDefault: data.is_default },
    version: data.version,
    tourCount: uses.tours,
  };
}

export async function deleteCancellationPolicy(id: string): Promise<DeleteResult> {
  await requirePermission("settings.manage");
  const { data: policy } = await repo.findCancellationPolicy(id);
  if (!policy) return { ok: false, error: "not_found" };
  if (policy.is_default) return { ok: false, error: "is_default" };
  const { error } = await repo.deleteCancellationPolicyRow(id);
  if (error) return { ok: false, error: error.code === "23503" ? "in_use" : "failed" };
  updateTag(CANCELLATION_POLICIES_TAG);
  return { ok: true };
}
