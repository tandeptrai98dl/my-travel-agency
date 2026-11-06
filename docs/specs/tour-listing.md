# Task Spec — Tour Listing

Last updated: 2026-11-07 · Task: TASK-P3-01 · Phase: 3 (`DEVELOPMENT_PLAN.md`) · Delivered as PR L of `docs/specs/phase-3-public-site.md`; the database step (section 3) ships earlier, in PR H

## Summary

`/tours` (EN: `/en/tours`) is a Server Component page that reads all search state from the URL, calls `catalog.service.searchTours()` and shows 12 tours per page. Filter components are client components whose only job is to update the URL. No API route.

**Scope**: list tours; search by name; filter by domestic/international, destination, travel style, price range, departure month and duration; sort by recommendation, price, duration or upcoming departure; pagination; responsive layout; loading, empty and error states.

**Assumptions** (★ = chosen in place of an unconfirmed detail, see Open questions):

- Filtering and sorting use the **display price per adult in VND** (ADR-011), computed live from bookable departures; `from_price` is used only for private tours and tours without departures. ★
- A tour appears only in languages with a published translation (ADR-016).
- Private tours have no departures, are labelled "Flexible departure" and always match the month filter. ★

**Dependencies**: Phase 0 (schema, RLS, next-intl), Phase 1 (design tokens, primitives) and the catalog admin of Phase 2.

## 1. Business rules

Goal: get customers to a **bookable** tour quickly; when nothing fits, move them to a tailor-made inquiry instead of losing them.

### 1.1 Which tours are shown

All of: `tours.status = 'published'`; a `tour_translations` row in the current language with `is_published = true`; every active filter matches (AND between filters, OR within one filter). Group tours without bookable departures still appear when no month filter is active, labelled "Contact us for dates".

### 1.2 Bookable departures

`status` in (`open`, `guaranteed`); `start_date ≥ today (Vietnam time) + bookingCutoffDays` (setting `booking_rules`, default 7); `capacity − seats_reserved > 0`.

### 1.3 Display price and next departure

| Tour | Display price | Next departure |
| --- | --- | --- |
| Group, with bookable departures | `min(price_adult)` of bookable departures (only within the selected months when filtering by month) | `min(start_date)` of the same set |
| Group, none | `tours.from_price` | "Contact us for dates" |
| Private | `tours.from_price` | "Flexible departure" |

Listing prices are indicative; the booking flow recalculates the final price.

### 1.4 Filters

| Filter | Rule |
| --- | --- |
| Search | Diacritic- and case-insensitive substring on `tour_translations.title` ("ha long" matches "Hạ Long"), or exact `tours.code`; 2–100 characters, shorter is ignored |
| Scope | `domestic`, `international` (multi-select) on `tours.scope` |
| Destination | Multi-select; a country or region includes its children; matches if any tour destination is in the set; only published destinations with a published translation and at least one visible tour are offered |
| Travel style | Multi-select on travel style keys; matches tours linked to any selected style; only published styles with a published translation are offered (added by `docs/specs/phase-3-public-site.md` decision 18 for the homepage search) |
| Price range | `[min, max]` on the display price, VND per adult; presets + custom inputs; swap if min > max |
| Departure month | Multi-select within the next 12 months; group tours need a bookable departure in a selected month; private tours always match |
| Duration | Buckets 1–4, 5–8, 9–14, 15+ days on `tours.duration_days` |

### 1.5 Sorting

| Value | Order |
| --- | --- |
| `recommended` (default) | `is_featured` desc → next departure asc (none last) → `published_at` desc → `id` |
| `price_asc` / `price_desc` | display price → `id` |
| `duration_asc` | `duration_days` asc → display price asc → `id` |
| `departure_asc` | next departure asc (none last) → `id` |

`id` is always the last tiebreaker so pages are stable.

### 1.6 Pagination

12 per page; numbered pages (`?page=2`); any filter, search or sort change resets to page 1; a `page` beyond the last page (with results) redirects (307) to the last page.

### 1.7 Analytics (after consent)

`view_item_list`, `search`, `select_item`, custom `filter_apply`. Track empty-result views: they show demand the company does not yet serve.

## 2. UI/UX

Results appear in the first screen; filters are compact and calm (no countdowns, loud discount badges or pop-ups).

### 2.1 Page structure

1. Breadcrumbs (Home / Tours).
2. Header: eyebrow, H1 ("Tất cả hành trình" / "All journeys"), one intro line; no large hero.
3. Toolbar: search, result count, sort; on mobile a "Filters (n)" button.
4. Active filter chips with "Clear all".
5. Filter column (desktop) + tour grid.
6. Pagination.
7. CTA band to the tailor-made inquiry (`/thiet-ke-rieng`, `/en/tailor-made`).

### 2.2 Layout

| Width | Filters | Grid | Toolbar |
| --- | --- | --- | --- |
| < 768px | Full-screen bottom sheet opened by "Filters (n)" | 1 column | Full-width search; second row: Filters + sort; sticky |
| 768–1023px | Right-side sheet | 2 columns | One row |
| 1024–1279px | Left column 264px, sticky | 2 columns | One row |
| ≥ 1280px | Left column 280px, sticky | 3 columns | One row |

### 2.3 Tour card

4:5 image (1.03 zoom on hover); badges "Private tour", "Few seats left" (≤ 4 seats on the next departure); eyebrow with up to 2 destinations; serif title (max 2 lines); duration ("8 days 7 nights"); departure line ("Departs 14/03/2027 · +3 more dates", "Flexible departure" or "Contact us for dates"); price ("From ₫89,000,000 per guest" / "Từ 89.000.000 ₫ / khách"; "Price on request" when `from_price` is 0). The whole card links to the tour; no "Book now" button on the card.

### 2.4 Interaction

| Action | Desktop | Mobile |
| --- | --- | --- |
| Select a filter | Applies immediately | Staged in the sheet; applied with "Apply"; "Reset" clears the sheet |
| Custom price | Applies on Enter or blur | Applies with "Apply" |
| Search | 400ms after typing stops or Enter; clear button | Same |
| Change page | Scroll to results, focus the results heading | Same |
| Back/Forward | Restores state from the URL | Same |

Filters use `router.replace` inside `startTransition`; pagination uses real `<Link>`s.

### 2.5 States

| State | Display |
| --- | --- |
| Initial loading | `<Suspense>` fallback: 12 skeleton cards + filter skeleton, no layout shift |
| Updating | Old results at 60% opacity, `aria-busy="true"`, thin progress bar; no skeleton flash |
| Empty (filters) | "No matching journeys yet", active filters, "Clear filters", 3 featured tours, tailor-made CTA |
| Empty (no tours in this language) | Short message, tailor-made CTA, contact links; no filters |
| Error | `error.tsx`: friendly message, "Try again" (`reset()`), hotline/Zalo; reported to Sentry |
| Invalid parameters | Silently dropped; defaults used |

### 2.6 Accessibility

`fieldset` + `legend` per filter group; real labels; chip remove buttons labelled ("Remove Vietnam filter"); result count in `aria-live="polite"`; the mobile sheet traps focus, closes on Esc and returns focus; `nav aria-label="Pagination"` with `aria-current="page"`; 44×44px touch targets; AA contrast.

### 2.7 SEO

Translated title/description, "– Page n" on later pages; unfiltered pages (including `?page=n`) are canonical to themselves; any filter, search or non-default sort → `noindex, follow` with canonical `/tours`; `hreflang` on unfiltered pages; JSON-LD `ItemList`; results server-rendered.

## 3. Database

No new tables (`DATABASE.md` already has `destinations.key`, `tours.scope`, the needed indexes and the `unaccent`/`pg_trgm` extensions). New migration `supabase/migrations/<timestamp>_tour_search.sql`:

1. `public.immutable_unaccent(text)`: wraps `extensions.unaccent` with an explicit dictionary; `immutable`, `strict`, `set search_path = ''` (required to index it).
2. GIN trigram index on `immutable_unaccent(lower(title))` of `tour_translations`.
3. `public.search_tours(...)` (section 4.3): `language sql`, `stable`, `security invoker`, `set search_path = ''`; `grant execute` to `anon`, `authenticated`. The 3 s limit is Supabase's default `statement_timeout` for the API roles (a function-level setting would not apply to the running statement).
4. Add any missing public read policies for the tables used (published rows only).
5. pgTAP: `supabase/tests/search_tours.test.sql`.

Regenerate types afterwards (`npm run db:types`). The display price is computed at query time; only above 500 tours or p95 > 150ms do we add a `tour_search_summary` table.

**Seed** (`supabase/seed.sql`): at least 30 tours (≥ 3 pages) across 4 countries, domestic and international, group and private, all 4 duration buckets, prices 15–300 million dong; departures over 12 months including sold-out, `closed`, within-cutoff and ≤ 4 seats left; one group tour without departures, one `draft` tour, one with an unpublished EN translation; Vietnamese titles with diacritics ("Vịnh Hạ Long", "Đà Lạt").

## 4. Data fetching

No API route. The page calls services in `src/modules/catalog`; the URL is the single source of truth.

### 4.1 URL parameters

| Param | Example | Validation | Default |
| --- | --- | --- | --- |
| `q` | `ha long` | trimmed, 2–100 chars | — |
| `scope` | `domestic,international` | only these values | — |
| `dest` | `vietnam,laos` (`destinations.key`) | max 10, unknown dropped | — |
| `style` | `honeymoon,family` (`travel_styles.key`) | max 10, unknown dropped | — |
| `price_min`, `price_max` | `30000000` | integer 0–10 billion, swapped if min > max | — |
| `month` | `2027-03,2027-04` | next 12 months only, max 12 | — |
| `duration` | `1-4,5-8,9-14,15-plus` | only these values | — |
| `sort` | `recommended`, `price_asc`, `price_desc`, `duration_asc`, `departure_asc` | others → default | `recommended` |
| `page` | `2` | ≥ 1 | `1` |

Unknown params ignored; defaults never written; fixed param order and sorted list values so a search always maps to one URL. Parsing/serialising lives in `src/modules/catalog/tour-search-params.ts` (Zod only, safe on the client).

### 4.2 Flow and caching (ADR-015)

1. `page.tsx` renders the static frame and a `<Suspense>` boundary; inside it, an async component reads `searchParams`, parses them, and calls `searchTours(locale, criteria)` and `getTourFilterOptions(locale)` in parallel.
2. `searchTours` returns `{ items, total, page, pageSize, totalPages }`; out-of-range pages redirect to the last page.
3. Results are **not cached** (seats change with bookings). `getTourFilterOptions` uses `"use cache"` with `cacheTag('tours', 'destinations', 'travel-styles')` (the tags the admin saves refresh) and `cacheLife('hours')`; the month list is computed per request.
4. Filter changes: `serializeTourSearchParams()` → `router.replace(url, { scroll: false })` in `startTransition`; Next re-renders on the server while keeping the old UI.

### 4.3 `searchTours` — two steps

**Step A — `supabase.rpc('search_tours', …)`** with the server session client (publishable key, RLS applies; never the service role). Parameters: `p_locale`, `p_q`, `p_scopes`, `p_destination_ids uuid[]` (children expanded in the service from the cached destination tree), `p_travel_style_ids uuid[]`, `p_price_min`, `p_price_max`, `p_months date[]`, `p_durations text[]`, `p_sort`, `p_limit`, `p_offset`, plus `p_featured_only` and `p_exclude_ids` for the homepage and related tours. The booking cutoff is read inside the function from `public.booking_cutoff_days()`. Inside: CTE of bookable departures (section 1.2, month-limited when filtering); aggregate per tour (min price, next date, departure count, seats left on the next departure); join published tours and published translations; apply filters (search term with `%`, `_`, `\` escaped); `order by` per section 1.5; `limit`/`offset`; `count(*) over ()`. Returns `tour_id`, `display_price`, `price_source`, `next_departure_date`, `other_departure_count`, `seats_left_next`, `total_count`.

**Step B — `supabase.from('tours').select(…)` by ids**: translation, hero image and destination names via nested selects; reorder to match Step A.

A timeout (3s) surfaces as an error handled by `error.tsx`.

### 4.4 TourListItem

| Field | Type | Notes |
| --- | --- | --- |
| id, slug, title, summary | string | current language |
| type, scope | `group`/`private`, `domestic`/`international` | |
| durationDays, durationNights | number | |
| displayPrice | number (VND) | `bigint` in the database |
| priceSource | `departure` / `from_price` | |
| nextDepartureDate | ISO string or null | |
| otherDepartureCount | number | |
| seatsLeftNext | number or null | |
| destinations | `{ key, name }[]` | max 2 |
| image | `{ url, width, height, blurDataUrl, alt }` or null | Supabase Storage URL, `alt` in the current language |

Formatting through `@/lib/money` and next-intl, time zone `Asia/Ho_Chi_Minh`.

## 5. Components (`src/components/tour/`)

| Component | Type | Responsibility |
| --- | --- | --- |
| TourListingProvider | Client | `useTransition` pending state + `navigate(criteria)` |
| TourListingToolbar | Client | Search, count, sort, mobile filter button; sticky on mobile |
| TourSearchInput | Client | Debounced (400ms) search with clear button |
| TourSortSelect | Client | Sort select |
| TourFilterPanel | Client | Filter content in `instant` (desktop) or `staged` (mobile) mode |
| ScopeFilter, DestinationFilter, TravelStyleFilter, PriceRangeFilter, DepartureMonthFilter, DurationFilter | Client | Individual filters (destination tree selects children; search box when > 10 items) |
| MobileFilterSheet | Client | Sheet with "Reset" and "Apply" |
| ActiveFilterChips | Client | Remove one or all filters |
| TourResults | Client wrapper | Dimming, `aria-busy`, `aria-live` count; server-rendered children |
| TourCard, TourGrid, TourGridSkeleton, TourListEmpty | Server | Card, grid (first 3 images prioritised), skeleton, empty variants |
| Pagination | Server (`src/components/ui/`) | Prev/next, numbers with "…", keeps other params |

Reuse shadcn primitives; add missing ones with `npx shadcn@latest add`, never private copies.

## 6. Files

| Area | Files |
| --- | --- |
| Database | `supabase/migrations/<ts>_tour_search.sql` (new), `supabase/tests/search_tours.test.sql` (new), `supabase/seed.sql` (change), `src/types/database.types.ts` (regenerate) |
| Catalog module | `src/modules/catalog/{tour-search-params,tour-search.constants,catalog.types,catalog.repository,catalog.service}.ts`, `__tests__/tour-search-params.test.ts`, `__tests__/search-tours.test.ts` (integration against local Supabase) |
| Lib | `src/lib/money.ts` (`formatPrice`), `src/lib/dates.ts` (today in Vietnam time, next 12 months) |
| Route | `src/app/(public)/[locale]/(site)/tours/{page,error}.tsx` with `generateMetadata` and JSON-LD |
| Components | 16+ files in `src/components/tour/`, `src/components/ui/pagination.tsx` |
| i18n, tests | `messages/{vi,en}/public-tours.json` (`tourListing` namespace), `src/i18n/pathnames.ts` (check), `tests/e2e/tour-listing.spec.ts` |

## 7. Task specification — TASK-P3-01

### 7.1 Preconditions

- [ ] Phase 0 migrations applied; `npx supabase start` works
- [ ] next-intl routing and pathnames work
- [ ] Phase 1 primitives available
- [ ] Phase 2 admin creates tours, departures and destinations and refreshes the `tours` and `destinations` tags on save

### 7.2 Steps (one commit each; lint, typecheck, tests green before moving on)

1. Database migration, pgTAP tests, seed, regenerated types; `explain analyze` confirms the trigram index is used.
2. `tour-search-params.ts` + constants + unit tests.
3. Repository and service + integration tests.
4. Server components: TourCard, TourGrid, TourGridSkeleton, TourListEmpty, Pagination.
5. Client components: provider, toolbar, search, sort, filter panel and filters, mobile sheet, chips, results wrapper.
6. Route: `page.tsx` (Suspense, metadata, JSON-LD, out-of-range redirect), `error.tsx`.
7. `messages/vi/public-tours.json`, `messages/en/public-tours.json`.
8. E2E tests (`tests/e2e/tour-listing.spec.ts`).
9. Update `docs/PROGRESS.md`; record any deviation in the PR.

### 7.3 Constraints

- No API route; filtering, pricing and sorting live in `search_tours`; parameters via `rpc()`, never string-built SQL.
- Session client only (RLS applies), never the service role.
- URL is the single source of truth; no filter state in localStorage or global stores.
- Prices only computed on the server.
- Results not cached; only filter options cached (`"use cache"` + `cacheTag('tours', 'destinations', 'travel-styles')`).
- No new libraries; all UI text via next-intl; tokens only for colors and spacing.
- Presentational components never import repositories or Supabase clients.
- English for code, comments, commits and PR text (ADR-007).

### 7.4 Acceptance criteria

**Functional**

- [ ] Only published tours with a published translation in the current language appear
- [ ] "ha long" finds "Vịnh Hạ Long"; an exact tour code finds that tour
- [ ] Domestic/international filter works; "Vietnam" includes tours tagged only with child destinations
- [ ] Price filter uses the display price; with a month filter, price and next departure consider only those months
- [ ] Sold-out, `closed` and within-cutoff departures are ignored
- [ ] Private tours always match the month filter and show "Flexible departure"
- [ ] All five sort options are correct and stable across pages
- [ ] 12 per page; filter changes reset to page 1; out-of-range page redirects to the last page
- [ ] Invalid params cause no errors; one search always yields one URL; switching language keeps filters

**UI and states**

- [ ] Layout matches section 2.2 at 375, 768, 1024, 1280px; no horizontal scrolling
- [ ] Desktop applies immediately; mobile on "Apply"
- [ ] Updating dims old results without skeleton flash
- [ ] Both empty variants and the error state (retry works)
- [ ] Back/Forward restores state

**Quality**

- [ ] Mobile Lighthouse on staging: Performance ≥ 90, Accessibility ≥ 95, SEO 100; LCP < 2.5s; CLS < 0.1
- [ ] `searchTours` p95 < 150ms on the 30-tour seed
- [ ] Fully keyboard-usable; result count announced
- [ ] Filtered pages `noindex, follow`; unfiltered canonical and hreflang correct
- [ ] No console errors or hydration warnings; pgTAP for `search_tours` passes

### 7.5 Test plan

| Scenario | Type | Expected |
| --- | --- | --- |
| Parse valid/invalid/missing/duplicate params; min > max; out-of-range month | Unit | Normalised object; stable URL; swap; drop |
| Draft tour; unpublished EN translation | Integration | Hidden in that language |
| Sold-out, closed, within-cutoff departures | Integration | Excluded from price and next date |
| Parent destination; scope filter | Integration | Children included; scope respected |
| Month + price | Integration | Price computed within selected months |
| Diacritic-free search; code search; `%`, `_`, `'` in the term | Integration | Correct, no errors, no false matches |
| Sorting + pagination | Integration | No duplicates or gaps across pages |
| Desktop: search → filter → sort → page 2 → Back | E2E | Correct URL and results each step |
| Mobile 375px: sheet → select → Apply → remove chip | E2E | Correct results; focus returns |
| Zero results → "Clear filters" | E2E | Full list |
| Simulated service error → "Try again" | E2E | Error state; retry works |

### 7.6 Out of scope

Facet counts; a filter by total budget; USD prices; wishlist, comparison, maps; `/tim-kiem` and destination pages (separate tasks reusing `searchTours`); a public API.

### 7.7 Handover prompt

```text
Read CLAUDE.md, the docs it imports, and docs/specs/tour-listing.md.
Implement TASK-P3-01 following section 7.2, one step at a time, in order.
Follow the constraints in section 7.3. Do not add new libraries.
After each step run npm run lint, npx tsc --noEmit, npm test and npx supabase test db;
commit as feat(tour-listing): <step>. Stop and ask if the docs conflict or an open
question affects the code. When done, update docs/PROGRESS.md and report every
acceptance criterion in section 7.4 as pass/fail with evidence.
```

## Open questions

The spec uses the listed option; reply only to change it.

| # | Question | Option used | If changed |
| --- | --- | --- | --- |
| L1 | Price for filter/sort | Lowest bookable departure price; private tours use `from_price` | `from_price` everywhere: simpler, may drift from reality |
| L2 | Show group tours with no departures? | Yes, "Contact us for dates" | Hide: tidier, fewer inquiry chances |
| L3 | Private tours under a month filter | Always match | Exclude: fewer results |
| L4 | Price presets (VND per guest) | < 30M · 30–60M · 60–100M · 100–200M · > 200M | Constants only |
| L5 | Duration buckets | 1–4 · 5–8 · 9–14 · 15+ | Constants only |
| L6 | "Few seats left" threshold | ≤ 4 | Constant; 0 disables |
| L7 | `noindex` on filtered pages | Yes; destination SEO uses destination pages | Indexing risks duplicate content |
