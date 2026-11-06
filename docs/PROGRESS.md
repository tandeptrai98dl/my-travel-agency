# Progress

Update this log at the start and end of each work session. Newest first.

## Current status

- **Phase:** 1 (Design system and UI shell); Phase 0 code-complete
- **Next up:** Phase 1 PR 7 (remaining primitives, `/admin/design-system`, axe accessibility checks). Phase 0's last acceptance items (Vercel preview health check, Sentry test event) wait for the owner's accounts
- **Owner actions:** create Supabase/Vercel/Sentry/Resend accounts; start the VNPay contract, e-commerce notification and bilingual content tracks; provide brand name, logo and contact details (`PROJECT_BRIEF.md` §9)

## Log

### 2026-11-06 (Phase 1 — PR 6: public layout shell)

Branch `feat/p1-layout-shell` (`docs/specs/phase-1-design-system.md` steps 5–11).

- Done:
  - `src/modules/settings` and `src/modules/catalog/destinations*`: cached (`"use cache"`, tags `settings` and `destinations`) public settings (Zod-validated) and the published destination tree per locale, read as anon; database errors give an empty shell, not a failed page.
  - Primitives: dialog, sheet, accordion, switch (shadcn new-york on Radix, ADR-021).
  - SiteHeader (transparent over the navy home hero, solid elsewhere and on scroll; brand from `settings`), destinations MegaMenu (Radix navigation menu, keyboard operable), MobileNav (sheet loaded on first open), SiteFooter (legal details, contact, social and policy links from `settings`, each only when set), ContactFloatingButton (hotline, Zalo, WhatsApp from `settings.contact`), CookieConsentBanner (essential only in one click, per-category settings dialog loaded on demand and reopenable from the footer, first-party `consent` cookie, `consentchange` event), designed 404, skip link and a single `<main id="main">`.
  - VI/EN strings for all of it.
  - E2E (`tests/e2e/shell.spec.ts`): database-driven header and footer, skip link, keyboard mega menu, localized navigation, hotline, consent flows, mobile sheet, floating contact stepping aside for the banner.
- Verified locally against a stub of the two REST reads (no Supabase containers here): lint, typecheck, 151 unit tests, production build, 24 shell and smoke E2E tests, screenshots at 375 and 1280 px (mega menu, mobile sheet, banner, 404 with footer). CI runs the same tests against real Supabase with the seed.
- Measured: home initial JS ≈ 179 KB gzip (local webpack; ≈ 158 KB before the shell). Over the 150 KB budget; see known issues.
- Independent review: changes requested (major: the desktop cookie banner covered the floating contact buttons; focus was lost after closing the mobile menu and the cookie settings, which have no Radix trigger. Minor: vacuous brand test, errors cached for the full `minutes` profile, `javascript:`/`data:` URLs accepted in settings, no scroll padding under the sticky header and the banner, `<dl>` without terms, duplicate "Language" landmarks, missing 768 px, focus-return and third-party-request tests, docs overclaims), all addressed:
  - The floating contact hides whenever the banner is open; banner choices move focus to `#main`; the menu sheet and the settings dialog return focus to their opener (or `#main`).
  - Settings URLs must be `https:` (the Ministry notification link may be `http:`) and an invalid URL drops only that field; failed reads are retried after 30 s but stay prerenderable (a `seconds` profile would fail the build during an outage); `scroll-padding-top`/`-bottom` keep focused elements clear of the header and banner.
  - The footer and menu switchers are plain groups (one "Language" landmark, in the header), language names carry `lang`, new-tab links say so to screen readers, "Essential only" has the same weight as "Accept all", consent switches are described by their text, a malformed `consent` cookie counts as undecided, and the page title uses the brand from `settings` like the header.
  - New E2E: exact seeded brand in header, footer and title; tablet (768 px) layout; focus return after Escape and after saving; no third-party requests before a consent choice; one Language landmark; no empty footer lists.
  - The plan's shell checkbox stays open until the PR 7 axe checks pass.

### 2026-11-06 (Phase 1 — PR 5: decisions, tokens, fonts, primitives)

Branch `feat/p1-design-tokens` (`docs/specs/phase-1-design-system.md` steps 1–4). The owner allowed the recommended solutions: ADR-016 to ADR-019 accepted (only admin edits departure prices), ADR-021 records the design values.

- Done:
  - Tokens in `globals.css` (light theme only) and `.theme-navy` for navy sections (with its own lighter status colours); Tailwind maps semantic, status and brand colours, fonts, the type scale, radius and easing; `dark:` only applies under an explicit `.dark` class. Contrast unit test over the text, status, border and focus token pairs in both themes (it found the error red unreadable on navy, now fixed with its own token), plus guards that the navy block is really read and that focus colours are solid; focus ring uses a deeper gold `#A7823E` (3:1 on light surfaces).
  - Cormorant Garamond and Be Vietnam Pro via `next/font` with the Vietnamese subset in every root layout.
  - Restyled primitives (button incl. gold variant, badge incl. status variants, input, label, card, checkbox, dropdown menu): 2/4 px corners, no shadows, solid 2 px focus rings, 44 px default buttons (small buttons 36 px; checkbox 20 px, which meets WCAG 2.2 AA 2.5.8 through the spacing exception and its clickable label).
  - Heading, Eyebrow, SectionHeading, Prose, Price, Container, Section; integer-only `src/lib/money.ts` (unit-tested); heading line-heights ≥ 1.15.
  - `cn()` knows the custom font sizes (tailwind-merge was dropping text colours); tailwind-merge pinned to v2, the line built for Tailwind 3.
  - `partialPrefetching: true` (ADR-021) silences the Next.js warning.
- Verified locally: lint, typecheck, unit tests; production build (webpack with mocked fonts) and smoke E2E; screenshots at 375 and 1280 px of the navy home placeholder and the 404 (fallback fonts locally; real fonts load in CI and on Vercel).
- Independent review: changes requested (major: input focus ring was 1.6:1; minor: link-button padding, `dark:` following the OS, navy contrast test could pass vacuously, status colours on navy, dropdown focus at 2.2:1, overclaims, docs), all addressed; re-review approved.

### 2026-11-06 (Phase 0 — PR 4 of 4: monitoring, deployment docs)

Branch `chore/p0-monitoring-docs` (spec step 10, the parts that do not need the owner's accounts).

- Done:
  - Sentry (`@sentry/nextjs`, ADR-014): server and edge configs started from `src/instrumentation.ts`, `onRequestError` capture, browser SDK loaded lazily after idle (adds ~0.6 KB to the initial JS instead of ~60 KB), `global-error.tsx` reports root-layout errors (SDK loaded on demand). Off whenever no DSN is set. Source maps upload only with `SENTRY_AUTH_TOKEN`.
  - Privacy (`src/lib/monitoring/sentry-options.ts`): Sentry 11's `dataCollection` turns off user info and IP inference, cookies, bodies, query strings, DB/queue data and stack variables, and allows only `user-agent`, `accept-language` and `content-type` headers; `beforeSend` and `beforeBreadcrumb` also redact query strings and payment-link tokens in URLs (including `contexts.nextjs.request_path`) and drop console breadcrumbs. Errors only: performance tracing is off on the server and in the browser (`tracesSampleRate` unset, tracing code excluded from the bundle), because Sentry 11 streams server spans past `beforeSendTransaction` and Next.js adds raw `http.target` URLs. A unit test sends a real error and a span through the SDK with a fake transport and asserts that no span is sent and none of an IP, geo header, token, cookie, OAuth code, payment token, password or email reaches the envelope (it fails with Sentry's defaults, and with tracing on); an E2E test does the same for a browser error and checks `infer_ip: never`.
  - `/api/monitoring/test-error` (POST): throws for an MFA-verified admin so the owner can confirm events arrive; 401 signed out, 403 for other roles and for admin below aal2, 405 for GET (E2E).
  - `README.md` rewritten: local setup, commands, every environment variable with where it comes from and where to set it, Vercel/Supabase/Sentry/GitHub owner setup.
- Verified: lint, typecheck, unit tests, production build (local webpack check) and CI (see the PR).
- Independent review: first pass changes requested (major: `sendDefaultPii` is ignored by Sentry 11, so IPs, headers, bodies and query strings would have been sent), then addressed together with browser-init proof, `global-error.tsx`, safer CI install retries, README test prerequisites and preview redirect URLs, a POST-only test route and fuller route tests. Second pass: changes requested (major: streamed server spans skip `beforeSendTransaction` and carry query strings), addressed by turning tracing off; `global-error.tsx` now initialises Sentry when needed; `request_path` redacted. Third pass: approved; its nits (tracing fully unset and excluded from the bundle, no double init) applied.
- Blocked by owner accounts: Vercel previews per PR, `/api/health` on a preview, and "a test error reaches Sentry" (needs the Sentry project and DSN). The steps are in `README.md` "Deployment".
- Measured: initial JS on the home page is ~158 KB gzip in a local webpack build without browser Sentry (budget 150 KB). Re-measure on the Turbopack production build and trim in Phase 3/6.

### 2026-11-06 (Phase 0 — PR 3 of 4: clients, auth helpers, i18n, proxy, admin shell, health)

Branch `feat/p0-app-shell` (spec steps 7–9 + E2E against local Supabase in CI).

- Done:
  - `src/lib/supabase/admin.ts` (service role, `server-only`); browser and server clients typed with the generated `Database`; `SUPABASE_SECRET_KEY` now required and must be a secret key.
  - `src/lib/auth/`: `getCurrentUser()` (verified with `getClaims()`, profile under RLS, session `aal`), `checkAccess()`/`requireRole()`/`requirePermission()` (aal2 for admin and accountant), `permissions.ts` (the `ARCHITECTURE.md` matrix).
  - next-intl: `src/i18n/{routing,pathnames,navigation,request}.ts`, `messages/{vi,en}.json`; VI without prefix, EN under `/en`, no Accept-Language redirects; localized 404; minimal `LanguageSwitcher` that keeps the path.
  - Separate root layouts: `[locale]` (`lang` from the URL), `admin` (`vi`), `auth` (`en`, starter pages).
  - `src/proxy.ts`: session refresh first (forwarded to rewrites), locale routing outside `/admin`, `/api`, `/auth`, session cookies with no-store headers, security headers. The starter "redirect every signed-out visitor" behaviour is gone.
  - Admin shell: `/admin` for every staff role (non-staff get a 404, signed-out visitors go to `/auth/login`, admin/accountant below aal2 go to `/admin/mfa`); `/admin/mfa` enrols or verifies TOTP; placeholder page shows email, role and MFA status. Staff sign-in now lands on `/admin`.
  - `/api/health`: `{ status, db }`, 200/503, no secrets, never cached.
  - Fix: `/auth/confirm` validated with Zod and no longer an open redirect (`safeRedirectPath`).
  - PR #2 review follow-up: sales note inserts scoped to inquiries they can see (new migration, 2 pgTAP assertions).
  - CI "Build and E2E" now runs against local Supabase with seeded accounts: home in VI/EN, language switch, localized 404, security headers, health, open-redirect check, signed-out and customer access, sales/operator/editor sign-in, accountant sent to MFA, admin TOTP enrolment and re-verification after a new sign-in.
- Verified locally: lint, typecheck, 82 unit tests; production build (webpack with Next.js's mocked Google Fonts, since font hosts are blocked here); routing, `lang`, 404s, headers, signed-out admin redirect and the language switch in Chromium; 64/64 pgTAP on the local shim. Sign-in, MFA and health with a database are verified only in CI (see the PR).
- Independent review: changes requested, then addressed: the redirect guard now checks the normalised path (`/.//host` bypass) and E2E proves it with real email-link tokens; MFA E2E timeout raised; next-intl `alternateLinks` and `localeCookie` off; MFA and sign-out moved to Server Actions in `src/modules/identity` (Zod-validated); only the `LanguageSwitcher` messages reach the client; deactivated accounts get a 404 instead of a sign-in loop; security headers set in `next.config.ts` for every path (HSTS without `includeSubDomains`/`preload` until the domain is known); email-link fallback is `/`; more E2E (unknown admin/API/auth paths, VI slug under `/en`, `sales_manager`, headers on several paths) and pathname unit tests; pgTAP for the admin side of the note policy.
- Deviations: MFA is required for admin and accountant only (other staff may enrol from `/admin/mfa`), per ADR-009; non-staff and deactivated accounts see a 404 on `/admin`; the admin gate renders inside `<Suspense>` (Cache Components), so its redirects and 404 are streamed (HTTP 200 shell, client-side redirect); security headers live in `next.config.ts` rather than the proxy, so static files get them too; unknown `/admin`, `/api` and `/auth` paths show Next.js's plain 404 (no root layout above them).

### 2026-11-06 (Phase 0 — PR 2 of 4: schema, RLS, storage, pgTAP, seed)

Branch `feat/p0-database` (spec steps 4–6 + the CI database job from step 10).

- Done:
  - Supabase CLI (`supabase init`, CLI as a dev dependency); `config.toml` with email confirmations, TOTP MFA and redirect URLs for `/auth/confirm` and `/auth/callback`.
  - 14 migrations: extensions (`extensions` schema; `pg_cron` in `pg_catalog`, no jobs), enums, `set_updated_at()`, all 36 tables copied from `DATABASE.md`, auth integration (role helpers, `can_act_as()`, profile trigger, email sync, profile guard), RLS on every table, column grants that keep booking status/money and departure seats out of API writes, storage buckets `media` and `private`.
  - `src/types/database.types.ts` generated by the Supabase CLI in CI.
  - pgTAP: `00_schema_test.sql` (11: tables, RLS everywhere, policies, `search_path`, privileges incl. default privileges, buckets) and `01_access_test.sql` (49: anon, customer, sales, editor, operator, accountant, admin, storage).
  - `seed.sql` (settings, cancellation policy, 3 countries with regions and cities, 4 travel styles, 6 tours, price tiers, departures from day 14 to day 182) and `npm run seed:users` (one confirmed account per role; local only unless `--allow-remote=<host>` names the exact host).
  - CI job "Database": `supabase start`, `db reset`, `test db`, `db lint`, type generation with a staleness check, `seed:users` run twice.
- Verified: see the PR description for the CI run. Locally (Postgres 16 with a Supabase-like shim; container registries are blocked in the cloud workspace) all migrations and the seed apply, 60/60 pgTAP assertions pass, and mutation checks make the matching assertions fail.
- Independent review: changes requested (stale types, staff could write booking money/status and departure seats, media SELECT policy, default privileges, weak tests, internal-notes scope, `--allow-remote`), then addressed. Customer access to internal booking/payment columns is recorded as a Phase 5 limit in `DATABASE.md`.
- Deviations from the spec: `can_act_as()` added as the single place for the admin/accountant `aal2` rule; `guard_profile_update()` also protects `is_active`, `deleted_at` and `email`; `internal_notes` gets its own migration after the booking group (it references bookings); bucket MIME and size limits; staff cannot create bookings or price lines through the API until the Phase 4 functions exist; `--allow-remote` must name the host.

### 2026-11-06 (Phase 0 — PR 1 of 4: housekeeping, test tooling, env validation, CI)

Branch `feat/p0-housekeeping` (spec steps 1–3 + CI skeleton + ADR-020).

- Done:
  - Removed starter tutorial content, the `/protected` example and starter branding; placeholder home page (`noindex`).
  - Fixed the `tailwind.config.ts` lint error; ESLint ignores build output and generated files.
  - Vitest and Playwright configured; Playwright smoke test for the home page (the spec's `/api/health` smoke test moves to PR 3, where the route is added).
  - Environment validation with Zod in `src/lib/env/`: `public.ts` exports client-safe literals (no Zod in the browser), `server.ts` (`server-only`) validates public and server values at startup via `src/instrumentation.ts`; rejects secret keys (new `sb_secret_` and legacy `service_role` JWT) used as the publishable key; `.env.example` complete.
  - GitHub Actions CI: lint, typecheck, unit tests, production build, sentinel-based check that server-only values never reach client bundles, Playwright smoke.
  - CI hardening after a runner stalled for over 6 minutes on `playwright install --with-deps`: 5-minute timeouts on the browser install and E2E steps, and the Chromium download cached per Playwright version and runner image (on a cache hit only the system libraries are installed).
  - ADR-020 (delivery workflow) and the matching `CLAUDE.md` section.
- Verified: `npm run lint`, `npm run typecheck`, `npm test` (10 tests) locally and in CI; production build, client-bundle leak check and E2E smoke in CI (the cloud workspace blocks Google Fonts, so `next build` cannot run there).
- Independent review: changes requested, then addressed (leak check, Zod removed from the client, legacy JWT check, doc paths, test assertion count, CI concurrency).
- Deviations from the spec: env code lives in `src/lib/env/{schema,public,server}.ts` instead of one `env.ts`; `SUPABASE_SECRET_KEY` stays optional until the admin client lands in step 7; no Prettier (not in ADR-014); the `server-only` package is added (required by `ARCHITECTURE.md` for the admin client; not listed in ADR-014); `@types/node` raised to 22 to match the runtime.
- Remaining Phase 0: Supabase schema, RLS, pgTAP, seed (PR 2); clients, auth helpers, i18n, admin shell, health check (PR 3); Sentry, Vercel, README (PR 4).

### 2026-11-06 (documentation update — full scope)

- Owner chose the full-scope MVP. Recorded ADR-005 to ADR-019 in `DECISIONS.md` (ADR-005 to ADR-015 accepted; ADR-016 to ADR-019 proposed).
- `PROJECT_BRIEF.md`: open questions §8 resolved; remaining owner inputs listed in §9.
- `ARCHITECTURE.md`: rewritten for the full scope (modules, Supabase clients, Cache Components, booking flow, permission matrix, VI/EN routes, security, SEO, performance).
- `DATABASE.md`: approved 36-table schema with RLS summary, storage and Postgres functions (replaces the draft).
- `DESIGN_SYSTEM.md`: kept the brief's palette; added Vietnamese-ready typography, motion, voice and the full component list.
- `FEATURES.md` and `DEVELOPMENT_PLAN.md`: full-scope features (P0/P1/P2) and Phases 0–6.
- `CLAUDE.md`: stack additions, English rule, new commands and conventions.
- Added task specs `docs/specs/phase-0-foundation.md` and `docs/specs/tour-listing.md`.
- Verified state: `npx tsc --noEmit` passes; `npx eslint src` has 1 error (`tailwind.config.ts`); `npm run lint` also scans `.next/`. No code changed in this update.

### 2026-11-06

- Scaffolded the project from the Next.js + Supabase starter (auth pages, shadcn/ui, Tailwind).
- Restructured: moved `app/`, `components/`, `lib/` and `proxy.ts` into `src/`, and added `public/`.
- Updated the `@/*` alias in `tsconfig.json`, the CSS path in `components.json` and the Tailwind content globs.
- Added `CLAUDE.md` and the `docs/` set.
- Updated `CLAUDE.md` with the project rules, workflow and progress-management rules.
- Replaced `PROJECT_BRIEF.md` with the official brief. Re-aligned `FEATURES.md`, `DESIGN_SYSTEM.md` (luxury palette and typography, proposed) and `DEVELOPMENT_PLAN.md` to it.
- Marked `DATABASE.md` as a draft with known gaps. The schema is pending decisions on the open questions.

## Blockers

- Vercel previews and the Sentry test event (Phase 0 acceptance) need the owner's Vercel and Sentry accounts; see `README.md` "Deployment".

## Known issues

- Phase 3/6: consent proof. The `consent` cookie is the only record of a cookie choice; when GA4 lands, decide whether cookie choices are also written to `consent_records` (Decree 13/2023 asks for proof of consent).
- Build cache after a Supabase outage (seen once locally): a webpack build with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9` succeeded with an empty shell; a second webpack build a few minutes later with the URL changed to the local stub, reusing `.next/cache`, served an empty 404 page until `.next` was deleted. The review found only compiler caches in `.next/cache`, so the baked-in `NEXT_PUBLIC_` URL change is the likely cause, not cached data. Re-check against the default Turbopack build on the first Vercel preview (Vercel restores `.next/cache`); if it appears there and the 30 s re-render does not repair it, treat it as a major bug.
- Phase 3: cheap initial-JS wins to try before the 150 KB budget review: render the desktop nav without client JS until the mega menu is opened, and load the floating contact's client code after idle.
- Phase 2: tour and departure price columns are not yet guarded per role (`DATABASE.md` "Known Phase 0 limits").
- Phase 5: customers can read internal columns of their own bookings and payments through the API (`DATABASE.md` "Known Phase 0 limits").
- The theme switcher is no longer rendered; next-themes stays installed for a possible admin dark mode (ADR-017).
- The starter `/auth` forms call the Supabase browser client directly (against the "components never import Supabase clients" rule); they are replaced by the localized auth pages with Server Actions in Phase 5.
- Phase 3: `LanguageSwitcher` keeps the same slug in both languages; content pages with per-language slugs need a slug lookup.
- Phase 6: add `includeSubDomains; preload` to HSTS once the production domain is fixed.
- Phase 3/6: initial JS on public pages is ≈ 179 KB gzip with the shell (≈ 158 KB framework baseline; local webpack measurement) against the 150 KB budget. Next steps: measure the Turbopack production build in CI, then consider rendering the desktop nav statically and loading the mega-menu panel on first hover/focus.
- Phase 3: footer and banner policy links use page keys (`/chinh-sach/privacy`); resolve the per-language slugs from `page_translations` when the policy pages are built.
- When performance tracing is wanted: add a `beforeSendSpan` that redacts span names and URL attributes, with a test, then set `tracesSampleRate` and drop `excludeTracing` in `next.config.ts`.
- Phase 4: when the `/pay/[token]` routes land, extend the Sentry unit test to check the envelope header (`trace.transaction`) for tokens too.
- Phase 3: the CSP needs `connect-src` for the Sentry ingest host (or a Sentry `tunnelRoute`). Phase 6 legal pages: the privacy policy must name Sentry as a processor.
