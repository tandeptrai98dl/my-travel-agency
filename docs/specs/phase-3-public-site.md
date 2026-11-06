# TASK-P3: Public website and SEO

Phase 3 of `DEVELOPMENT_PLAN.md`. Customers browse the catalog and content in Vietnamese and English on server-rendered, cached pages built from the Phase 2 data. No booking, payment or inquiry writes (Phases 4–5): the calls to action that need them are wired to a feature flag and point to the contact channels until then.

Stream B (ADR-025). Stream A finishes Phase 2 in parallel (PR F: journal, pages, reviews, redirects; PR G: settings and staff).

## Inputs

- `ARCHITECTURE.md`: routes, rendering and caching (ADR-015), SEO, performance budget, security (CSP, redirects in Redis).
- `DATABASE.md`: public read policies, tour and departure rules (ADR-024, ADR-026).
- `DESIGN_SYSTEM.md` and the Phase 1 shell (`src/components/layout`, `src/components/typography`, `src/components/ui`).
- `FEATURES.md` (customer website, P0), `docs/specs/tour-listing.md` (TASK-P3-01), `docs/specs/phase-2-catalog-admin.md` (decisions 3–7 and 9).
- ADR-006 (per-language publishing), ADR-011 (money), ADR-015, ADR-016, ADR-017, ADR-021, ADR-025.
- `PROGRESS.md` known issues tagged Phase 3 (CSP hosts, policy slugs, LanguageSwitcher slugs, initial-JS budget, consent proof, cancellation-policy cache tag).
- Design references (Claude Design, private to the owner's account until shared):
  - Design system **Premium Travel Agency**: https://claude.ai/artifact/2cDe2RLf3kBQ1ej9isBioC — tokens, type scale, components and brand book, built from `globals.css`, `tailwind.config.ts` and `DESIGN_SYSTEM.md`.
  - Mockups **Premium Travel — Phase 3 mockups**: https://claude.ai/artifact/RUFGxvZzdHML6F3WHZBmyH — artboards below.

## Design references

The mockups use the seeded content (`supabase/seed.sql`), the seeded sample brand name and flat two-tone image frames instead of photos. Bracketed text (`[SỐ GIẤY PHÉP]`, review quotes, journal titles) marks content that does not exist yet; nothing on them is a real review or statistic. Where the spec and a mockup disagree, the spec wins.

| Artboard | Layout |
| --- | --- |
| Homepage · desktop 1440 / mobile 390 | Navy hero under a transparent header (the existing SiteHeader): eyebrow and display title from the `homepage` setting, one lead line, a white search bar (destination, departure month, travel style, "Tìm hành trình", the one filled button). Then: trust bar on white (licence, payments, contact hours); featured tours (3 TourCards, link to the listing); featured destinations as an editorial 7/5 split (Vietnam large, Japan and France stacked) with best time to visit; travel styles (4 portrait cards on white); testimonial on navy (one featured review, gold hairline); journal teaser (3 cards); tailor-made CTA (navy split with photo, gold button); newsletter (email + outline button); SiteFooter. Mobile stacks everything, the search bar becomes three stacked fields with a full-width button, destinations become one large and two half-width cards, journal items become thumbnail rows. |
| Tour listing · desktop / mobile | Per `tour-listing.md` §2: breadcrumbs, eyebrow + H1 + one line, toolbar (search, live count, sort), active chips with "Xóa tất cả", 280 px filter column (scope, destination tree, price presets + custom range, month chips, duration), 3-column TourCard grid, pagination, navy tailor-made band. Mobile: sticky toolbar with search, "Bộ lọc (n)" and sort, chips + count, one column. |
| Tour detail · desktop / mobile | Breadcrumbs; gallery (one 2×2 image + four, "Xem 8 ảnh"); eyebrow (destinations), H1, subtitle; facts bar (duration, group size, departures, style, code); summary in serif; three highlights on gold hairlines; itinerary timeline (day number, title, description, meals, overnight, optional day image); inclusions and exclusions; live departures table (dates, status badge, seats, adult price, "Chọn"); child/infant/single-room rules; deposit and cancellation cards; FAQ (`<details>`); sticky booking box on the right (price "Từ", departure select, travellers, estimate, the one filled button, a note that seats are held only at payment, inquiry link); related tours. Mobile: 4:5 gallery with counter, 2×2 facts, departure cards, a bottom bar with the price and "Chọn ngày khởi hành". |

## Decisions taken in this spec (recommended defaults, owner pre-approved "recommended solutions")

1. **Images**: `ResponsiveImage` (`src/components/media/responsive-image.tsx`) wraps `next/image` with a loader for Supabase Storage image transformations (`/storage/v1/render/image/public/media/<path>?width=&quality=75&resize=contain`, `format=origin` left to the CDN's AVIF/WebP negotiation). The loader is used when `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS=true` (staging and production, Supabase Pro); otherwise images are served from the plain public object URL with `unoptimized` (local Supabase, CI). Every image passes `width`/`height` from `media`, a `sizes` string per usage, `placeholder="blur"` with `media.blur_data_url`, and the alt text of the current language (`media.alt[locale]`, never empty on published content per ADR-024). The LCP image (hero, gallery lead) gets `priority`. A media row whose file is missing, or no media at all, renders `ImageFrame`, a neutral frame at the same aspect ratio, so layout never shifts. CSP `img-src` gains the Supabase host.
2. **Data access**: public pages read through new read-only modules (`src/modules/catalog/public/*`, `src/modules/content/public/*`) with the session-less public client (`lib/supabase/public.ts`, anon, RLS applies), never the service role and never the admin repositories. Queries select explicit columns. Missing rows return `null`; database errors throw (see decision 12).
3. **Caching (ADR-015)**, using the tags the Phase 2 services already refresh:
   | Page | Cached (`"use cache"`, `cacheLife("hours")`) | Tags | Live (inside `<Suspense>`, after `await connection()`) |
   | --- | --- | --- | --- |
   | Home | sections, featured tours with "from" price and next date | `settings`, `tours`, `destinations`, `travel-styles`, `reviews`, `posts` | — |
   | Tour detail | content, gallery, itinerary, policy, related tours | `tours`, `tour:<id>`, `destinations`, `travel-styles`, `cancellation-policies`, `settings` | departures, seats, prices in the booking box, the tour's JSON-LD offers |
   | Listing, search | filter options (`tours`, `destinations`, `travel-styles`) | | results (`tour-listing.md` §4.2) |
   | Destinations, styles | page and its tours (no seat badges) | `destinations`, `travel-styles`, `tours` | — |
   | Journal, pages, reviews | content | `posts`, `pages`, `reviews`, `settings` | — |
   Cached views never show seat counts or "Sắp hết chỗ" (they would go stale between bookings); only the listing results and the tour detail's live section do. `tour-listing.md` §4.2 names a `catalog` tag: read it as `tours` + `destinations`. Saving a cancellation policy must also refresh `tours` (known issue; PR H adds it to the policy service with the coordinator's agreement, since the policy pages are Stream A's done work).
4. **Dynamic routes and builds**: `[slug]` routes export `generateStaticParams` with the published slugs of each locale (read as anon). When the read fails or returns nothing, it returns one sentinel slug that renders `notFound()`, so a build during a database outage still succeeds and pages render on demand. Verified against Next.js 16 behaviour in PR H.
5. **Languages**: a page exists in a language only when its row and that translation are published (ADR-006); otherwise `notFound()`, both for missing and unpublished translations. `alternates.languages` (hreflang) lists only languages with a published translation, plus `x-default` → Vietnamese when Vietnamese is published. Canonical is the page's own localized URL.
6. **LanguageSwitcher slug lookup**: each content page renders `<LocaleAlternates links={{ vi, en }} />`, a tiny client component that publishes the page's per-language paths (from the same data as hreflang) into a store read by the existing `LanguageSwitcher` (`useSyncExternalStore`). Without alternates the switcher keeps today's same-path behaviour. When the other language has no published translation, the switcher links to that language's parent page (tour → `/en/tours`, destination → `/en/destinations`, article → `/en/journal`) with `hreflang` and a title saying the page is not available in that language.
7. **Rich text**: destination `content`, posts and pages render through the whitelist renderer `src/components/typography/rich-text.tsx` that Stream A ships in Phase 2 PR F (decision 7 of the Phase 2 spec). Until PR F merges, Phase 3 pages show the plain fields (summary, description, best time to visit) and never raw JSON; PR K starts after PR F.
8. **Display price and availability**: tour cards everywhere use `search_tours()` from `tour-listing.md` §4.3 (display price, next bookable departure, other departure count, seats left). The migration moves from PR L into PR H, because the tour detail's related tours and the homepage need the same numbers. Bookable departure: `open` or `guaranteed`, starting on or after today in Vietnam plus the booking cutoff, with seats left. The cutoff comes from `public.booking_cutoff_days()` (security definer, stable, `search_path = ''`, granted to anon and authenticated), which returns `settings.booking_rules.booking_cutoff_days` or 7: `booking_rules` is not a public setting, and this exposes one number, not the row. Seats are shown as "Còn N chỗ" (exact count, never capacity); the warning badge "Sắp hết chỗ" appears at 4 or fewer.
9. **Calls to action before Phases 4–5**: `src/lib/features.ts` holds `booking` and `inquiry` flags (both `false` now; Phase 4 and Phase 5 switch them on). While `booking` is off the booking box keeps the departure select and the estimate, and its filled button reads "Liên hệ đặt chỗ" / "Contact us to book" and goes to the contact page with the tour code and date in the query; the hotline sits under it. While `inquiry` is off, tailor-made CTAs go to the contact page too. The newsletter section is hidden until the Phase 5 double opt-in action exists. No link ever points at a route that returns 404.
10. **JSON-LD** through one `JsonLd` server component that serialises with `<`, `>` and `&` escaped (`<` …), so content can never close the script tag:
    - every page: `BreadcrumbList` (with the visible breadcrumbs);
    - home and about: `TravelAgency` (also `Organization`) from `settings.company`/`contact`, only fields that are set;
    - tour detail: one node typed `["Product", "TouristTrip"]` with name, description, image, `touristType` from styles, `itinerary` as an `ItemList` of days, and an `AggregateOffer` (VND low/high price over bookable departures, offer count, availability) rendered inside the live boundary; private tours use `from_price` with `priceSpecification` "from". No `AggregateRating` until verified reviews (P1);
    - listing, destination, style pages: `ItemList` of tour URLs; journal articles: `Article`; `/faq`: `FAQPage`.
11. **Open Graph images**: pages with a photo use it directly (the translation's `og_media_id`, else the hero), transformed to 1200×630 by the image loader when transforms are on. Pages without one (home, listing, search, policies) use a generated image from `src/app/[locale]/opengraph-image.tsx` (`next/og`): brand name from settings in Cormorant Garamond on navy with a gold rule, statically generated per locale. The two font files it needs are committed as OFL `.ttf` subsets in `src/assets/fonts/` (no new dependency). This replaces the `/api/og` route in `ARCHITECTURE.md`, which takes no free-text query parameters this way; `ARCHITECTURE.md` is updated in PR M.
12. **Stale data and errors**:
    - Cached reads that fail are cached briefly (`cacheLife({ stale: 30, revalidate: 30, expire: 300 })`, the settings pattern) and the page renders what it has: a homepage section with no data is left out, the footer keeps working.
    - A detail page whose read fails (an error, not a missing row) throws to the route's `error.tsx` (friendly message, "Thử lại" with `reset()`, hotline and Zalo from settings, reported to Sentry). It never answers 404 on an error, which would be cached and could drop the page from search.
    - The live departures section has its own error boundary: "Chưa tải được lịch khởi hành" with a retry button and the hotline, while the rest of the page stays.
    - Nothing shows a "last updated" time; listing prices are labelled "Từ" (indicative, `tour-listing.md` §1.3).
13. **CSP per page type** (`src/lib/csp.ts`, unit-tested):
    - Cached public pages: a nonce-free policy set as a header in `next.config.ts` for public paths: `default-src 'self'; script-src 'self' 'unsafe-inline'` (Next.js inline bootstrap scripts cannot carry a nonce on cached pages), `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob: <supabase host>`, `font-src 'self'`, `connect-src 'self' <supabase host> <sentry ingest host>`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`. GA4/GTM hosts are added with consent mode in Phase 6.
    - Checkout, account and admin: a nonce-based policy from the proxy (`script-src 'nonce-…' 'strict-dynamic'`), these routes are dynamic already; admin adds the Supabase Storage host to `connect-src` for signed uploads.
    - Hosts come from validated env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SENTRY_DSN`), never hard-coded. E2E fails on any `securitypolicyviolation` event.
14. **Redirects**: the proxy looks up `redirect:<path>` in Upstash Redis for public `GET`/`HEAD` requests before locale routing and answers with the stored status (301/308) when found. It uses the key format and helper Stream A defines in PR F (`redirects` sync), a 50 ms timeout and fails open; a 60-second in-memory cache per instance holds hits and misses. Without `UPSTASH_REDIS_REST_URL`/`_TOKEN` it is a no-op (logged once). `hits` counting stays out (P1).
15. **Policy and fixed pages**: `pages.key` `about` and `faq` render at their fixed routes (`/ve-chung-toi`, `/cau-hoi-thuong-gap`); `terms`, `privacy`, `cancellation` and `payment` render at `/chinh-sach/[slug]` with their translation slugs. A cached `getPolicyLinks(locale)` (tag `pages`) gives the footer and the cookie banner the real paths; a policy without a published translation is left out of the footer, and the cookie banner's privacy link falls back to the contact page until the privacy page is published (the Phase 6 checklist requires all four policies in both languages).
16. **Initial JS budget** (150 KB gzip on public pages; ≈ 179 KB measured in Phase 1):
    - the desktop navigation renders as static links; the mega-menu panel's client code loads on first hover or focus of its trigger;
    - the floating contact button's client code loads after idle;
    - gallery lightbox and mobile filter sheet load on first open; FAQ uses native `<details>` (no JS);
    - CI measures the gzip size of the JavaScript loaded by `/` and one tour detail page from the production build (`scripts/check-js-budget.mjs`): a warning from PR H, a failure from PR M.
17. **Draft preview and day images** (moved from Phase 2 PR D): `/admin/tours/[id]/preview?locale=vi|en` renders the public tour components for staff with the session client (drafts visible through staff RLS), uncached, `noindex`, behind `requirePermission("tours.read")`. Itinerary days may show one image from `media_ids`; PR H adds a MediaPicker per day in the tour editor's itinerary cards and extends the media delete usage check to itinerary `media_ids` (the Tiptap image scan stays with PR F).
18. **Hero search and travel styles**: the hero form submits `GET /tours?dest=<key>&month=<yyyy-mm>&style=<key>`. `style` is a new listing filter (`tour-listing.md` §1.4 had it out of scope): multi-select on travel style keys, matching tours linked to any of them, with its own filter group. The homepage hero image is an optional `homepage.hero.media_id` in the `homepage` setting (shape agreed with Stream A for PR G's settings editor); without one the hero is the navy band.
19. **Trust bar and testimonials** use only real data: the licence number and legal name from `settings.company`, contact hours from `settings.contact`, fixed copy for payment methods; an item whose data is missing is left out. Testimonials are approved, featured reviews; without any the section is left out. No invented statistics.
20. **Departure notes** are public: `departures.note` is readable by anon through the existing policy, so the public table shows it (for example "Mùa hoa anh đào") and the admin field is labelled as shown to customers (a one-line hint in Stream A's departure editor, by agreement). Internal remarks go in internal notes (Phase 4).

## Stream rules

- Migrations use timestamps `20261108200000`–`20261108299999`. The branch that merges second regenerates `src/types/database.types.ts`.
- Stream A owns departures, posts, pages, reviews, redirects, settings and staff writes. This stream only adds read functions, views and public read policies there and never changes their write rules or grants.
- UI strings go only in `messages/{vi,en}/public-home.json`, `public-tours.json` and `public-pages.json` (more files are added to `MESSAGE_FILES` in `src/i18n/messages.ts` if needed). Shared shell strings (`public.json`) change only when a shell component changes.
- New ADRs start at ADR-027. Seed additions for the listing (≥ 30 tours, `tour-listing.md` §3) go in one delimited block at the end of `supabase/seed.sql`.

## Steps

One pull request per group, one commit per step. Every page: Server Component, metadata through the Metadata API, VI/EN strings, `notFound()` for unpublished translations, axe clean at 375 and 1280 px.

### PR H — Tour detail and shared pieces

1. Migration `20261108200000_public_catalog_reads.sql`: `immutable_unaccent()`, the trigram index, `search_tours()` (`tour-listing.md` §3–4.3 with the `style` filter of decision 18) and `booking_cutoff_days()`; pgTAP (`supabase/tests/`) for bookable-departure rules, published-only rows, the `style` filter and grants; regenerated types.
2. Shared pieces: `ResponsiveImage` + loader + `ImageFrame` (decision 1), `Breadcrumbs` with `BreadcrumbList`, `JsonLd`, `LocaleAlternates` + switcher store (decision 6), `DateText`/date formatting in `@/lib/dates`, `features.ts` (decision 9), `TourCard` (`tour-listing.md` §2.3, without seat badges when cached).
3. `src/modules/catalog/public/`: tour detail read (content, gallery, destinations, styles, policy, price tiers; cached, decision 3), live departures read, related tours (same country or style, up to 3, via `search_tours`), `generateStaticParams` source (decision 4); unit tests for mapping and fallbacks.
4. Components in `src/components/tour/`: TourGallery (+ lightbox on demand), TourHeader, TourFactsBar, TourHighlights, ItineraryTimeline (day image), InclusionsList, DepartureTable (live, responsive cards below `md`), PriceTiers (private tours), PolicySummary, FAQList (`<details>`), BookingBox (sticky on desktop, bottom bar on mobile; decision 9), RelatedTours.
5. Route `src/app/[locale]/(site)/tours/[slug]/{page,error,loading?}.tsx`: metadata (title, description, canonical, hreflang, OG image), JSON-LD (decision 10), live boundary with skeleton and error state (decision 12); `messages/{vi,en}/public-tours.json` (`tourDetail` namespace).
6. Admin: preview route and itinerary day images (decision 17); `tours` tag refreshed on cancellation-policy saves.
7. JS budget script in CI as a warning (decision 16) and the mega-menu/floating-contact deferrals.
8. E2E `tests/e2e/tour-detail.spec.ts`: VI and EN pages of a seeded tour, 404 for a draft and for an unpublished EN translation, hreflang only for published languages, switcher goes to the other slug, departures section, private tour shows price tiers and the inquiry path, error state of the live section (stubbed failure), axe at 375 and 1280 px.

### PR I — Homepage

9. `src/modules/content/public/homepage.ts`: one cached read for the sections (decision 3, 18, 19).
10. `src/components/marketing/`: Hero + HeroSearch (GET form, works without JS), TrustBar, FeaturedTours, DestinationShowcase (7/5 split), TravelStyleCards, Testimonial, JournalTeaser (reads published posts; hidden when none), TailorMadeCta, NewsletterSignup (hidden, decision 9).
11. `src/app/[locale]/(site)/page.tsx` replaces the placeholder: metadata, `TravelAgency` JSON-LD, generated OG image (decision 11); `public-home.json`; E2E `tests/e2e/home.spec.ts` (sections from seed, hidden sections without data, hero search lands on a filtered listing, axe).

### PR J — Destinations and travel styles

12. Reads: destination tree with counts, destination page (summary, best time, children, its tours via `search_tours` with the destination and its descendants), travel style page and its tours.
13. Routes `/diem-den`, `/diem-den/[slug]`, `/phong-cach/[slug]` (EN equivalents) with metadata, `ItemList`, breadcrumbs; the mega menu links to real pages; rich `content` once PR F's renderer exists (decision 7); `public-pages.json` (`destinations`, `travelStyles`); E2E.

### PR K — About, reviews, contact, FAQ, policies, journal

14. Pages from `pages` keys (decision 15), journal list with categories and article page (`Article` JSON-LD, editorial layout), reviews page (approved reviews, verified badge), contact page (company details, hotline, Zalo, WhatsApp, office hours, map link; the form arrives in Phase 5), FAQ (`FAQPage`). Starts after PR F; reads empty data gracefully before content exists.
15. Footer and cookie-banner policy links from `getPolicyLinks` (decision 15); `public-pages.json`; E2E.

### PR L — Tour listing and site search

16. `docs/specs/tour-listing.md` §7.2 steps 2–8 (the database step moved to PR H), with the `style` filter (decision 18) and the seed block.
17. Site search `/tim-kiem`: tours (`search_tours` with `q`), destinations and journal articles through `search_site(q, locale)` (migration `20261108210000_site_search.sql`, security invoker, pgTAP), `noindex`; E2E.

### PR M — SEO completion and hardening

18. `sitemap.xml` split by type (tours, destinations, styles, journal, pages) with `lastmod` and per-language URLs (published translations only); `robots.txt` blocking `/admin`, account, checkout, search and filtered listings.
19. CSP per page type (decision 13) with unit tests and the E2E violation check; redirects from Redis in the proxy (decision 14) with unit tests against a fake Redis.
20. JS budget enforced in CI; `ARCHITECTURE.md` (OG route, CSP, image transforms), `DESIGN_SYSTEM.md` (new components) and `.env.example` (`NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS`, Upstash variables) updated.

## Acceptance criteria

- [ ] Every public page in `ARCHITECTURE.md` "Routes" up to Phase 3 (home, tours, tour detail, destinations, travel styles, journal, about, reviews, contact, FAQ, policies, search) renders from the database in VI and EN
- [ ] Pages without a published translation, and draft content, return 404 in that language; hreflang lists only published languages; the language switcher lands on the other language's slug
- [ ] Tour detail: live departures with seats and prices inside Suspense; cached content refreshed by the admin's `revalidateTag()`/`updateTag()` calls; private tours show indicative price tiers and the inquiry path
- [ ] No link to a route that does not exist yet (booking and inquiry flags, decision 9)
- [ ] JSON-LD valid (schema.org) and passing the Rich Results Test on staging for a tour, the home page, an article and the FAQ (blocked until the owner's Vercel account)
- [ ] `sitemap.xml`, `robots.txt`, canonical URLs and OG images present; filtered listings are `noindex, follow`
- [ ] CSP enforced per page type with no violations in E2E; redirects served from Redis when configured, no-op otherwise
- [ ] axe: no serious or critical violations at 375 and 1280 px on every public page; keyboard operable; Vietnamese diacritics never clipped
- [ ] Initial JS ≤ 150 KB gzip on `/` and a tour detail page in the production build; Core Web Vitals "Good" on staging (blocked until Vercel)
- [ ] Lint, typecheck, unit, pgTAP, E2E green in CI

## Out of scope

Booking and payment flows (Phase 4), tailor-made wizard, contact form, newsletter sign-up and accounts (Phase 5), GA4 and consent proof in `consent_records` (Phase 6), `AggregateRating` and post-trip reviews (P1), itinerary maps, wishlist, comparison, USD prices (P1), Meilisearch or a search summary table (only on the signals in `ARCHITECTURE.md` "Scalability").

## Handover prompt

```text
Read CLAUDE.md, the docs it imports, docs/specs/phase-3-public-site.md and docs/specs/tour-listing.md.
Implement the next PR of the Phase 3 spec, one step per commit, following the decisions and the stream
rules. Run lint, tsc, unit tests, pgTAP and the production build before each push; check public pages
at 375 and 1280 px with axe. Open the PR with an acceptance table, deviations and blockers.
```
