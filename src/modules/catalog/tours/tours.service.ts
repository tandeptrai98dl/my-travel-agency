import "server-only";

import { updateTag } from "next/cache";

import { getPathname } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { slugify } from "@/lib/slug";
import { readAlt } from "@/modules/media/media.schemas";
import { syncSlugRedirect } from "@/modules/content/redirects.service";
import { getMediaUrl } from "@/modules/media/media.service";

import * as repo from "./tours.repository";
import {
  emptyTourTranslation,
  type NewTourInput,
  TOUR_LOCALES,
  type TourInput,
  type TourLocale,
  TOURS_PAGE_SIZE,
  type TourValues,
} from "./tours.schemas";

/** Cache tags for public tour reads: every list (`tours`) and one tour's pages (`tour:<id>`). */
import { TOURS_TAG, tourTag } from "../cache-tags";
export { TOURS_TAG, tourTag };

function refresh(id: string) {
  updateTag(TOURS_TAG);
  updateTag(tourTag(id));
}

export type TourSaveError =
  | "not_found"
  | "slug_taken"
  | "slugInvalid"
  | "code_taken"
  | "codeInvalid"
  | "publishNeedsTranslation"
  | "publishNeedsHero"
  | "dayImageAlt"
  | "publishNeedsPrice"
  | "publishNeedsDeparture"
  | "requiredToPublish"
  | "lastTranslation"
  | "keepLanguage"
  | "onlyLanguage"
  | "adminOnly"
  | "failed";
export type TourSaveResult = { ok: true; id: string } | { ok: false; error: TourSaveError; field?: string };

type DbError = { code?: string; message?: string; details?: string } | null;

/** Postgres error → form error (constraints and the *_tour_rules.sql triggers). */
export function mapTourError(error: DbError, locale?: TourLocale): TourSaveResult {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`;
  const at = locale ?? "vi";
  if (error?.code === "23505" && text.includes("slug")) {
    return { ok: false, error: "slug_taken", field: `translations.${at}.slug` };
  }
  if (error?.code === "23505" && text.includes("code")) return { ok: false, error: "code_taken", field: "code" };
  if (error?.code === "42501" && text.includes("price")) return { ok: false, error: "adminOnly", field: "prices" };
  if (error?.code === "23514") {
    if (text.includes("code_format")) return { ok: false, error: "codeInvalid", field: "code" };
    if (text.includes("slug_format")) return { ok: false, error: "slugInvalid", field: `translations.${at}.slug` };
    if (text.includes("needs a published translation")) {
      return { ok: false, error: "publishNeedsTranslation", field: "status" };
    }
    if (text.includes("hero image")) return { ok: false, error: "publishNeedsHero", field: "heroMediaId" };
    if (text.includes("needs a price")) return { ok: false, error: "publishNeedsPrice", field: "status" };
    if (text.includes("needs a departure")) return { ok: false, error: "publishNeedsDeparture", field: "status" };
    if (text.includes("SEO description")) {
      return { ok: false, error: "requiredToPublish", field: `translations.${at}.seoDescription` };
    }
    if (text.includes("last published translation")) {
      return { ok: false, error: "lastTranslation", field: `translations.${at}.isPublished` };
    }
  }
  logger.error("tours.write_failed", { code: error?.code, message: error?.message });
  return { ok: false, error: "failed" };
}

function tourPath(locale: TourLocale, slug: string) {
  return getPathname({ href: { pathname: "/tours/[slug]", params: { slug } }, locale });
}

// List ----------------------------------------------------------------------------------------------

export type TourListItem = {
  id: string;
  code: string;
  title: string;
  type: "group" | "private";
  scope: "domestic" | "international";
  status: "draft" | "published" | "archived";
  durationDays: number;
  isFeatured: boolean;
  locales: Record<TourLocale, { exists: boolean; published: boolean }>;
  nextDeparture: string | null;
};

/** PostgREST filter syntax is dropped from free-text search. */
function cleanSearch(q: string) {
  return q.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim();
}

export async function listTours(params: {
  q: string;
  filters: Record<string, string>;
  sort: string;
  dir: "asc" | "desc";
  page: number;
}): Promise<{ items: TourListItem[]; total: number; pageCount: number }> {
  await requirePermission("tours.read");
  const q = cleanSearch(params.q);
  let ids: string[] = [];
  if (q) {
    const { data } = await repo.findTourIdsByTitle(q);
    ids = [...new Set((data ?? []).map((row) => row.tour_id))];
  }
  const from = (params.page - 1) * TOURS_PAGE_SIZE;
  const { data, error, count } = await repo.listTourRows({
    q,
    ids,
    filters: params.filters,
    sort: params.sort,
    ascending: params.dir === "asc",
    from,
    to: from + TOURS_PAGE_SIZE - 1,
  });
  if (error) throw new Error(`tours query failed: ${error.message}`);
  const rows = data ?? [];
  const { data: departures } = await repo.nextDepartures(rows.map((row) => row.id));
  const next = new Map<string, string>();
  for (const departure of departures ?? []) if (!next.has(departure.tour_id)) next.set(departure.tour_id, departure.start_date);
  const items = rows.map((row) => {
    const translation = (locale: TourLocale) => row.tour_translations.find((t) => t.locale === locale);
    return {
      id: row.id,
      code: row.code,
      title: translation("vi")?.title || translation("en")?.title || row.code,
      type: row.type,
      scope: row.scope,
      status: row.status,
      durationDays: row.duration_days,
      isFeatured: row.is_featured,
      locales: {
        vi: { exists: Boolean(translation("vi")), published: Boolean(translation("vi")?.is_published) },
        en: { exists: Boolean(translation("en")), published: Boolean(translation("en")?.is_published) },
      },
      nextDeparture: next.get(row.id) ?? null,
    };
  });
  const total = count ?? items.length;
  return { items, total, pageCount: Math.max(1, Math.ceil(total / TOURS_PAGE_SIZE)) };
}

// Editor --------------------------------------------------------------------------------------------

export type MediaSummary = { id: string; url: string; alt: string; altComplete: boolean };

export type TourEditorData = {
  values: TourInput;
  media: Record<string, MediaSummary>;
  canEditPrices: boolean;
  activeDepartures: number;
  publishedAt: string | null;
};


const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function readItinerary(value: unknown): TourInput["translations"]["vi"]["itinerary"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((day): day is Record<string, unknown> => Boolean(day) && typeof day === "object")
    .map((day) => ({
      title: typeof day.title === "string" ? day.title : "",
      description: typeof day.description === "string" ? day.description : "",
      meals: stringList(day.meals).filter((meal): meal is "breakfast" | "lunch" | "dinner" =>
        ["breakfast", "lunch", "dinner"].includes(meal),
      ),
      accommodation: typeof day.accommodation === "string" ? day.accommodation : "",
      mediaId: stringList(day.media_ids)[0] ?? null,
    }));
}

function readFaqs(value: unknown): TourInput["translations"]["vi"]["faqs"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((faq): faq is Record<string, unknown> => Boolean(faq) && typeof faq === "object")
    .map((faq) => ({
      question: typeof faq.question === "string" ? faq.question : "",
      answer: typeof faq.answer === "string" ? faq.answer : "",
    }));
}

async function mediaSummaries(ids: string[]): Promise<Record<string, MediaSummary>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await repo.findMediaRows(unique);
  return Object.fromEntries(
    (data ?? []).map((row) => {
      const alt = readAlt(row.alt);
      return [
        row.id,
        { id: row.id, url: getMediaUrl(row.path), alt: alt.vi || alt.en, altComplete: Boolean(alt.vi.trim() && alt.en.trim()) },
      ];
    }),
  );
}

export async function getTourEditor(id: string): Promise<TourEditorData | null> {
  const user = await requirePermission("tours.read");
  const { data, error } = await repo.findTour(id);
  if (error) throw new Error(`tour query failed: ${error.message}`);
  if (!data) return null;
  const translation = (locale: TourLocale): TourInput["translations"]["vi"] => {
    const row = data.tour_translations.find((t) => t.locale === locale);
    if (!row) return emptyTourTranslation();
    return {
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle ?? "",
      summary: row.summary,
      highlights: stringList(row.highlights),
      itinerary: readItinerary(row.itinerary),
      inclusions: stringList(row.inclusions),
      exclusions: stringList(row.exclusions),
      practicalInfo: typeof row.practical_info === "string" ? row.practical_info : "",
      faqs: readFaqs(row.faqs),
      seoTitle: row.seo_title ?? "",
      seoDescription: row.seo_description ?? "",
      ogMediaId: row.og_media_id,
      isPublished: row.is_published,
    };
  };
  const galleryIds = [...data.tour_media].sort((a, b) => a.sort_order - b.sort_order).map((m) => m.media_id);
  const vi = translation("vi");
  const en = translation("en");
  const departures = await repo.countActiveDepartures(id);
  return {
    values: {
      id: data.id,
      code: data.code,
      type: data.type,
      scope: data.scope,
      status: data.status,
      durationDays: data.duration_days,
      durationNights: data.duration_nights,
      minPax: data.min_pax,
      maxPax: data.max_pax,
      minPaxToOperate: data.min_pax_to_operate,
      childAgeMax: data.child_age_max,
      infantAgeMax: data.infant_age_max,
      isFeatured: data.is_featured,
      heroMediaId: data.hero_media_id,
      galleryIds,
      destinationIds: data.tour_destinations.map((d) => d.destination_id),
      travelStyleIds: data.tour_travel_styles.map((s) => s.travel_style_id),
      prices: {
        fromPrice: data.from_price,
        depositPercent: data.deposit_percent,
        balanceDueDays: data.balance_due_days,
        cancellationPolicyId: data.cancellation_policy_id,
      },
      translations: { vi, en },
    },
    media: await mediaSummaries([
      ...galleryIds,
      data.hero_media_id ?? "",
      vi.ogMediaId ?? "",
      en.ogMediaId ?? "",
      ...[...vi.itinerary, ...en.itinerary].map((day) => day.mediaId ?? ""),
    ]),
    canEditPrices: user.role === "admin",
    activeDepartures: departures.count,
    publishedAt: data.published_at,
  };
}

export async function getEditorOptions() {
  await requirePermission("tours.read");
  const { destinations, styles, policies } = await repo.editorOptions();
  const name = (rows: { locale: string; name: string }[], fallback: string) =>
    rows.find((row) => row.locale === "vi")?.name ?? fallback;
  const byId = new Map((destinations.data ?? []).map((row) => [row.id, row]));
  const label = (row: NonNullable<typeof destinations.data>[number]): string => {
    const own = name(row.destination_translations, row.key);
    const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
    return parent ? `${label(parent)} › ${own}` : own;
  };
  return {
    destinations: (destinations.data ?? [])
      .map((row) => ({ id: row.id, label: label(row) }))
      .sort((a, b) => a.label.localeCompare(b.label, "vi")),
    travelStyles: (styles.data ?? []).map((row) => ({ id: row.id, label: name(row.travel_style_translations, row.key) })),
    policies: (policies.data ?? []).map((row) => ({
      id: row.id,
      label: `${row.name} (v${row.version})`,
      isDefault: row.is_default,
    })),
  };
}

// Writes --------------------------------------------------------------------------------------------

async function freeSlug(locale: TourLocale, base: string, excludeId?: string): Promise<string> {
  const root = (base || "tour").slice(0, 72);
  for (let n = 1; n < 50; n += 1) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const { ownerId } = await repo.findTourSlugOwner(locale, candidate);
    if (!ownerId || ownerId === excludeId) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Creates a draft from the short form; the editor fills in the rest (step 12). */
export async function createTour(input: Required<Pick<NewTourInput, "code" | "type" | "scope" | "durationDays" | "durationNights" | "title">>): Promise<TourSaveResult> {
  await requirePermission("tours.edit_content");
  const { data: defaultPolicy } = await repo.defaultCancellationPolicyId();
  const saved = await repo.insertTour({
    code: input.code,
    type: input.type,
    scope: input.scope,
    status: "draft",
    duration_days: input.durationDays,
    duration_nights: input.durationNights,
    // The price guard sets prices and terms for non-admins; admins start from the same defaults.
    from_price: 0,
    cancellation_policy_id: defaultPolicy ?? null,
  });
  if (saved.error || !saved.data) return mapTourError(saved.error);
  const id = saved.data.id;
  const { error } = await repo.upsertTourTranslation({
    tour_id: id,
    locale: "vi",
    slug: await freeSlug("vi", slugify(input.title)),
    title: input.title,
    summary: "",
    is_published: false,
  });
  if (error) {
    await repo.deleteTourRow(id);
    return mapTourError(error, "vi");
  }
  refresh(id);
  return { ok: true, id };
}

/** Saves the whole editor (step 13), in an order the publish triggers accept. */
export async function saveTour(values: TourValues): Promise<TourSaveResult> {
  const user = await requirePermission("tours.edit_content");
  if (!values.id) return { ok: false, error: "not_found" };
  const { data: existing } = await repo.findTour(values.id);
  if (!existing) return { ok: false, error: "not_found" };
  const id = existing.id;
  const isAdmin = user.role === "admin";
  // Only admins send prices; for everyone else the stored ones stay (the trigger would refuse).
  const prices = isAdmin && values.prices ? values.prices : null;
  const fromPrice = prices ? prices.fromPrice : existing.from_price;

  const publishing = values.status === "published";
  if (publishing && values.type === "private" && fromPrice <= 0) {
    return { ok: false, error: "publishNeedsPrice", field: isAdmin ? "prices.fromPrice" : "status" };
  }
  if (publishing && values.type === "group") {
    const departures = await repo.countActiveDepartures(id);
    if (departures.count === 0) return { ok: false, error: "publishNeedsDeparture", field: "status" };
  }
  // Decision 3, checked before anything is written (the database checks again at the end).
  if (publishing && values.heroMediaId) {
    const { data: hero } = await repo.findMediaRows([values.heroMediaId]);
    const alt = readAlt(hero?.[0]?.alt);
    if (!alt.vi.trim() || !alt.en.trim()) return { ok: false, error: "publishNeedsHero", field: "heroMediaId" };
  }
  // Day photos of a published language need both alt texts, like every published image.
  for (const locale of TOUR_LOCALES) {
    const translation = values.translations[locale];
    if (!translation.isPublished) continue;
    const dayIds = translation.itinerary.flatMap((day) => (day.mediaId ? [day.mediaId] : []));
    if (dayIds.length === 0) continue;
    const { data: rows } = await repo.findMediaRows(dayIds);
    const complete = new Set(
      (rows ?? []).filter((row) => {
        const alt = readAlt(row.alt);
        return alt.vi.trim() && alt.en.trim();
      }).map((row) => row.id),
    );
    const index = translation.itinerary.findIndex((day) => day.mediaId && !complete.has(day.mediaId));
    if (index >= 0) return { ok: false, error: "dayImageAlt", field: `translations.${locale}.itinerary.${index}.mediaId` };
  }
  // Removing a whole language is not done by clearing its title (it would silently drop the
  // itinerary, FAQs and SEO of that language).
  for (const locale of TOUR_LOCALES) {
    const before = existing.tour_translations.find((row) => row.locale === locale);
    if (before && !values.translations[locale].title) {
      return { ok: false, error: "keepLanguage", field: `translations.${locale}.title` };
    }
  }

  let wrote = false;
  const done = (result: TourSaveResult) => {
    if (wrote) refresh(id);
    return result;
  };

  // Publishing: content first, status last. Unpublishing: status first, then content.
  const base = {
    code: values.code,
    type: values.type,
    scope: values.scope,
    duration_days: values.durationDays,
    duration_nights: values.durationNights,
    min_pax: values.minPax,
    max_pax: values.maxPax,
    min_pax_to_operate: values.minPaxToOperate,
    child_age_max: values.childAgeMax,
    infant_age_max: values.infantAgeMax,
    is_featured: values.isFeatured,
    hero_media_id: values.heroMediaId,
    ...(prices
      ? {
          from_price: prices.fromPrice,
          deposit_percent: prices.depositPercent,
          balance_due_days: prices.balanceDueDays,
          cancellation_policy_id: prices.cancellationPolicyId,
        }
      : {}),
  };
  // Not yet published: keep the stored status (draft or archived) until the final update.
  const firstStatus = publishing ? existing.status : values.status;
  // A published tour keeps its hero until the end, so the publish trigger never sees it without one.
  const firstHero = publishing && existing.status === "published" ? existing.hero_media_id ?? values.heroMediaId : values.heroMediaId;
  const first = await repo.updateTour(id, { ...base, hero_media_id: firstHero, status: firstStatus });
  if (first.error) return done(mapTourError(first.error));
  wrote = true;

  // Languages becoming published go first, so the tour is never left without one.
  const order = [...TOUR_LOCALES].sort(
    (a, b) => Number(values.translations[b].isPublished) - Number(values.translations[a].isPublished),
  );
  for (const locale of order) {
    const t = values.translations[locale];
    const before = existing.tour_translations.find((row) => row.locale === locale);
    // A language without a title was never saved (an existing one was refused above).
    if (!t.title) continue;
    const { error } = await repo.upsertTourTranslation({
      tour_id: id,
      locale,
      slug: t.slug,
      title: t.title,
      subtitle: t.subtitle,
      summary: t.summary,
      highlights: t.highlights,
      itinerary: t.itinerary.map((day, index) => ({
        day: index + 1,
        title: day.title,
        description: day.description,
        meals: day.meals,
        accommodation: day.accommodation,
        media_ids: day.mediaId ? [day.mediaId] : [],
      })),
      inclusions: t.inclusions,
      exclusions: t.exclusions,
      practical_info: t.practicalInfo,
      faqs: t.faqs,
      seo_title: t.seoTitle,
      seo_description: t.seoDescription,
      og_media_id: t.ogMediaId,
      is_published: t.isPublished,
    });
    if (error) return done(mapTourError(error, locale));
    // A published language serves its path again: a redirect left from an earlier removal or
    // slug change would shadow it (the proxy reads Redis before the page).
    if (t.isPublished) {
      const path = tourPath(locale, t.slug);
      const cleared = await repo.deleteRedirectFrom(path);
      if (cleared.error) logger.error("tours.redirect_clear_failed", { locale, message: cleared.error.message });
      else if (cleared.data?.length) await syncSlugRedirect(path);
    }
    // Decision 4: right after this language is saved, so a later failure cannot lose it.
    if (before?.is_published && before.slug !== t.slug) {
      const redirect = await repo.saveRedirect(tourPath(locale, before.slug), tourPath(locale, t.slug));
      if (redirect.error) logger.error("tours.redirect_failed", { locale, message: redirect.error.message });
      else await syncSlugRedirect(tourPath(locale, t.slug));
    }
  }

  const links = await repo.updateTourLinks(id, {
    media: values.galleryIds,
    destinations: values.destinationIds,
    styles: values.travelStyleIds,
  });
  if (links.error) return done(mapTourError(links.error));

  if (firstStatus !== values.status || firstHero !== values.heroMediaId) {
    const last = await repo.updateTour(id, {
      status: values.status,
      hero_media_id: values.heroMediaId,
      ...(publishing && !existing.published_at ? { published_at: new Date().toISOString() } : {}),
    });
    if (last.error) return done(mapTourError(last.error));
  }
  return done({ ok: true, id });
}

/**
 * Removes one language of a tour (Phase 2 polish). The tour keeps at least one language, and a
 * published tour keeps a published one (check_tour_translation() refuses otherwise). When the
 * removed language was published, its page gets a 301: to the tour in the other language when that
 * is published, else to the tour listing of the removed language (decision 4).
 */
export async function removeTourLanguage(input: { id: string; locale: TourLocale }): Promise<TourSaveResult> {
  await requirePermission("tours.edit_content");
  const { data: tour } = await repo.findTour(input.id);
  if (!tour) return { ok: false, error: "not_found" };
  const removed = tour.tour_translations.find((row) => row.locale === input.locale);
  if (!removed) return { ok: false, error: "not_found" };
  const other = tour.tour_translations.find((row) => row.locale !== input.locale);
  if (!other) return { ok: false, error: "onlyLanguage" };
  if (tour.status === "published" && removed.is_published && !other.is_published) {
    return { ok: false, error: "lastTranslation" };
  }
  const deleted = await repo.deleteTourTranslation(tour.id, input.locale);
  if (deleted.error) return mapTourError(deleted.error, input.locale);
  if (!deleted.data?.length) return { ok: false, error: "not_found" };
  if (removed.is_published) {
    const from = tourPath(input.locale, removed.slug);
    const to = other.is_published
      ? tourPath(other.locale, other.slug)
      : getPathname({ href: "/tours", locale: input.locale });
    const redirect = await repo.saveRedirect(from, to);
    if (redirect.error) logger.error("tours.redirect_failed", { locale: input.locale, message: redirect.error.message });
    else await syncSlugRedirect(to);
  }
  refresh(tour.id);
  return { ok: true, id: tour.id };
}

/** Copies content, links and media, never departures; the copy is a draft (step 12). */
export async function duplicateTour(input: { id: string; code: string }): Promise<TourSaveResult> {
  const user = await requirePermission("tours.edit_content");
  const { data: source } = await repo.findTour(input.id);
  if (!source) return { ok: false, error: "not_found" };
  const saved = await repo.insertTour({
    code: input.code,
    type: source.type,
    scope: source.scope,
    status: "draft",
    duration_days: source.duration_days,
    duration_nights: source.duration_nights,
    min_pax: source.min_pax,
    max_pax: source.max_pax,
    min_pax_to_operate: source.min_pax_to_operate,
    child_age_max: source.child_age_max,
    infant_age_max: source.infant_age_max,
    hero_media_id: source.hero_media_id,
    // Copied for admins; the price guard replaces them with defaults for everyone else.
    from_price: user.role === "admin" ? source.from_price : 0,
    deposit_percent: source.deposit_percent,
    balance_due_days: source.balance_due_days,
    cancellation_policy_id: source.cancellation_policy_id,
  });
  if (saved.error || !saved.data) return mapTourError(saved.error);
  const id = saved.data.id;
  const undo = async (result: TourSaveResult) => {
    await repo.deleteTourRow(id);
    return result;
  };
  for (const row of source.tour_translations) {
    const locale = row.locale as TourLocale;
    const { error } = await repo.upsertTourTranslation({
      tour_id: id,
      locale,
      slug: await freeSlug(locale, `${row.slug.slice(0, 66)}-${locale === "vi" ? "ban-sao" : "copy"}`),
      title: row.title,
      subtitle: row.subtitle,
      summary: row.summary,
      highlights: row.highlights,
      itinerary: row.itinerary,
      inclusions: row.inclusions,
      exclusions: row.exclusions,
      practical_info: row.practical_info,
      faqs: row.faqs,
      seo_title: row.seo_title,
      seo_description: row.seo_description,
      og_media_id: row.og_media_id,
      is_published: false,
    });
    if (error) return undo(mapTourError(error, locale));
  }
  const links = await repo.updateTourLinks(id, {
    media: [...source.tour_media].sort((a, b) => a.sort_order - b.sort_order).map((m) => m.media_id),
    destinations: source.tour_destinations.map((d) => d.destination_id),
    styles: source.tour_travel_styles.map((s) => s.travel_style_id),
  });
  if (links.error) return undo(mapTourError(links.error));
  refresh(id);
  return { ok: true, id };
}

export async function isTourSlugAvailable(input: { locale: TourLocale; slug: string; excludeId?: string }) {
  await requirePermission("tours.edit_content");
  const { ownerId, error } = await repo.findTourSlugOwner(input.locale, input.slug);
  if (error) throw new Error(`slug lookup failed: ${error.message}`);
  return ownerId === null || ownerId === input.excludeId;
}
