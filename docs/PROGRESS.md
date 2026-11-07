# Progress

Update this log at the start and end of each work session. Newest first.

## Current status

- **Phase:** 2 complete; 3 and 4 code-complete (acceptance waits for the owner's Vercel, Upstash and VNPay accounts); 5 code-complete (acceptance waits for staging); 6 in progress (spec #50, 6P #55 and 6B #54 merged; 6A, the public security PR, 6C, 6Q and 6L left); Phases 0 and 1 code-complete
- **Next up (two streams, ADR-025):** Stream A: Phase 6 PR 6A (security review, payment hardening, CI scans), then 6C (restore rehearsal, protected migrations). Stream B: public security checks and the public backlog, then 6Q (needs staging and the owner's content); both streams then 6L (`docs/specs/phase-6-hardening-launch.md`). pgTAP numbers: Stream A 50–59, Stream B 36–49. The repository is public (2026-11-07) so CI is free. Design system and mockups: https://claude.ai/artifact/2cDe2RLf3kBQ1ej9isBioC and https://claude.ai/artifact/RUFGxvZzdHML6F3WHZBmyH.
- **Owner actions:** the 14 numbered items in `docs/specs/phase-6-hardening-launch.md` "What the owner must provide" (accounts: Supabase, Vercel, Sentry, Resend with DNS, Upstash, Turnstile, VNPay, SePay or Casso, Google; Supabase Auth production settings; legal review; brand and content; branch protection on `main`)

## Phase backlog (non-blocking review findings, ADR-025)

Open items:
- Email client (`email.service.ts`): `skipped` rows in `email_logs` and status-code-only error logs, in Phase 4 PR 4E.
- Phases 4–5 (PR 15 review): account and checkout sit under the shared `[locale]` root layout, so ADR-027's dynamic-with-nonce approach needs their own root layout or a new spike.

- Migrations: a branch's migration timestamps must be later than the newest migration on main when it merges; rename on rebase (the stream ranges only prevent name clashes). ADR numbers: the branch that merges second renumbers.
- Before go-live (Phase 4 spec): VNPay sandbox vectors for cancelled and failed IPNs, SePay/Casso/VNPay source-IP allow-lists, Casso signature check, `VNPAY_STUB` never on staging with real-looking data.
- Contact form and newsletter stay disabled until the owner's Turnstile, Upstash and Resend keys exist and a privacy policy is published.

- Emails (PR 4E review): alert or runbook for `email_logs` rows stuck in `queued` and for `failed` sends, plus a staff "resend"; `skipped` keys are spent for good (README); the emailed access token is reusable for 7 days (record or make single use); payment-link email through `after()`.

- Phase 3 (staging only): measure the 50 ms redirect timeout on cold starts; with real Upstash, save a tour and `curl -I` its other-language slug (expect a 301 with `Location`). The other PR M items were done in #43 and #49.

- Nit (#48): type the inquiry `panels` as `React.ReactElement[]`.
- Phase 6 (#55 review, in Stream B's public security PR): scope the Google CSP hosts to book and checkout; purge `newsletter_unsubscribe_tokens`; no dead link for a subscriber who leaves mid-export; pgTAP 34 privilege assertion for update and delete; a unit test for the `ga-disable` switch. Later: a Resend unsubscribe write-back (`List-Unsubscribe` from broadcasts leaves the subscriber active in our list).
- Flaky E2E: `tour-publish.spec.ts:47` timed out once waiting for the media dialog's alt field (#55 CI); watch it.
- Stream A should acknowledge the `begin_checkout` line #55 added to the book page (stream rules).
- Public (#49 review, in Stream B's public security PR): a topic's language pair should need a published article in both languages; the switcher's fallback drops the query string; an E2E should check the server HTML of `/lien-he` for `href="/en/contact"`.
- Owner (before staging): Supabase "Confirm email" and "Secure email change" ON, the new Auth email templates, minimum password length 10, leaked-password protection; `settings.contact.email` for team alerts.

## Log

### 2026-11-07 (Phase 6 — 6B: monitoring and housekeeping)

PR #54, branch `feat/p6-monitoring` (migrations `20261113100000`, `20261113110000`).

- `cron_failures(since)` (failed and overdue pg_cron runs); daily `booking-tokens-cleanup`, `webhook-payload-trim` (only payloads already in `payments.raw_response`, never unmatched or error rows) and `cron-history-purge`.
- `/api/cron/health-checks` (every 15 min): one email per job per check for failed or missed runs (exactly-once keys, nothing spent without `settings.contact.email`), Sentry only for new alerts, `tours` refreshed after lapsed holds. `/api/cron/housekeeping` (daily): staged uploads older than 24 h. Sentry Cron Monitors and an optional `CRON_HEARTBEAT_URL`.
- Sentry releases from the commit SHA; webhook rejections as sampled warnings; README runbooks.
- Backlog closed: `email_logs.failed_at`, redirects cleared when a language is published in the journal, page and taxonomy editors, the Phase 5 minors (dashboard count, `no_address`, `auth.identities` emptied on deletion, consent readers documented).
- Verified: pgTAP 28 (46) and 29 (12), 961 unit tests, JS budget; CI green.
- Independent review: approved; quota minors fixed after the rebase onto #55.

### 2026-11-07 (Phase 6 — 6P: analytics, cookie consents, newsletter unsubscribe)

PR #55, branch `feat/p6-analytics-consent` (migrations `20261112100000`, `20261112110000`).

- `cookie_consents` (pseudonymous id in the `consent` cookie, no IP, user agent or account; service-role insert; 5-year purge) and `recordConsentChoice` (Zod, fail-closed limit, server-side banner hash, retry on the next page view, error log when unavailable).
- GA4 through gtag.js only after "analytics": Consent Mode v2, manual `page_view` with route templates (`/404` for unknown paths), referrers reduced; no GA on payment links, lookup, account, sign-in, newsletter or `?access=` pages (and switched off after a client-side navigation there); withdrawal deletes `_ga*` and `_gcl*`; five scrubbed events, HMAC `transaction_id`; CSP hosts only with a measurement ID.
- Newsletter unsubscribe: single-use hashed tokens from the audited export (`unsubscribe_url` column), `/ban-tin/huy` on a button press, withdrawal in `consent_records`.
- Verified: pgTAP 34 (16) and 35 (17), unit tests, JS budget (`/tours` 148.9 KB), E2E with a local Google fixture; CI green.
- Independent review: one major (stale types), fixed; minors fixed or in the backlog.

### 2026-11-07 (Phase 5 — booking lookup link)

PR #52, branch `fix/p5-enable-booking-lookup`: `features.bookingLookup` on (footer link only; the page stays gated by Turnstile and, on Vercel, Resend). E2E in both languages. Independent review: approved.

### 2026-11-07 (Phase 5 — 5D: operations)

PR #53, branch `feat/p5-operations` (migration `20261111100000`).

- `/api/cron/balance-reminders` and `/api/cron/departure-checks` (`vercel.json`, `CRON_SECRET`, digest comparison): reminders for the smallest window (7 or 2 days, Vietnam dates, catch-up), one alert for overdue balances (never cancelled), minimum-traveller alerts at 21, 14 and 7 days.
- `/admin` dashboards per role (`admin_dashboard()`); passenger CSV per departure (audited in the same transaction, no passport field).
- `/admin/customers`: notes, consents, JSON export (audit first) and open deletion requests with blockers, finished or retried by an MFA admin.
- Fixed a 5B bug: the deletion ban left the name in Auth metadata (GoTrue merges `user_metadata`); E2E now proves it from `auth.users`.
- Verified: pgTAP 27 (47) and 26 (57), 861 unit tests, E2E per role; CI green.
- Independent review: approved; minors fixed in #54.

### 2026-11-07 (Phase 6 — spec)

PR #50, branch `docs/p6-spec` (docs only).

- `docs/specs/phase-6-hardening-launch.md`: 14 owner items, 14 decisions (evidence-based security review, payment hardening, monitoring that alerts once, housekeeping, Lighthouse and accessibility QA, launch content and SEO, analytics, PITR rehearsal, VNPay sign-off, staff UAT, production deployment, launch checklist, no new features, backlog closure), PRs 6A–6C (Stream A), 6P–6Q (Stream B), 6L (both).
- ADR-039: GA4 through `gtag.js` only after consent (Consent Mode v2, manual `page_view` with route templates, never on payment-link, lookup or account pages); pseudonymous `cookie_consents` records. `ARCHITECTURE.md` analytics row updated.
- Independent review: changes requested (GA leaking codes and tokens in paths and referrers; webhook trim would destroy unmatched transfers; owner list and launch checklist incomplete; newsletter unsubscribe dropped), all fixed; targeted re-review approved. New minors in the backlog.

### 2026-11-07 (Phase 3 — public backlog)

PR #49, branch `fix/p3-public-backlog`.

- Language switcher: plain links (no 404 prefetches of Vietnamese paths from English pages), correct server-rendered href and the Vietnamese home's overlay header (`currentRoute()` reads the public and internal forms; no layout shift).
- Sitemaps throw on read errors, so an outage keeps the last good sitemap instead of caching a 503; Phase 3 decision 4 corrected.
- Redis language pairs: topics count only where they have a published article.
- Verified: 798 unit tests, Turbopack build and budget (`/tours` 147.7 KB); CI green.
- Independent review: approved; nits in the backlog.

### 2026-11-07 (Phase 5 — inquiry panel fix)

PR #48, branch `fix/inquiries-e2e` (main's E2E was red after #45).

- Inquiry action panels were keyed by position, so taking an inquiry remounted the note and status forms on refresh (a note being typed could be lost); keyed by name now, and the E2E waits for the refreshed page.
- Independent review: approved.

### 2026-11-07 (Phase 5 — 5B: guest booking lookup and account deletion)

PR #46, branch `feat/p5-lookup-deletion` (migration `20261110130000`).

- `/tra-cuu-booking`: code and email, Turnstile, fail-closed limits, always the same answer; a single-use 30-minute lookup token (at most 3 open) emailed in `after()`, opened by the ADR-038 button flow. The page stays behind `features.bookingLookup` until Stream B's flag PR.
- Deletion from the account profile with the password (5-per-hour limit before the password check): ban and revoke, `anonymise_customer()` (every table of decision 8, one transaction, idempotent, review audit rows stripped), GoTrue soft delete; waits for an admin while a trip or money is open; a retry runs the remaining steps; `finishDeletionAsAdmin()` and `admin_anonymise_customer()` (admin at aal2) ready for 5D.
- Email-sync trigger skips deleted profiles; reviews audited without names or text; #45 minor fixed (first response after spam).
- Verified: lint, tsc, unit tests, pgTAP 26 (56), Turbopack build and JS budget; CI green.
- Deviations: lookup tokens are not issued without Resend (logged `skipped`); the export and the admin deletion UI move to 5D.
- Independent review: approved with two fixes (limit before the password check, older review audit content), both done.

### 2026-11-07 (Phase 5 — 5W: tailor-made wizard and tour inquiry form)

PR #43, branch `feat/p5-wizard` (migration `20261110120000`).

- `/thiet-ke-rieng` 5-step wizard with a browser draft (no contact fields stored), inquiry form on private tour pages, `create_tailor_made_inquiry()` (service role, private tours only, strict privacy version, consent in the same transaction); `sendInquiryEmails()` for the wizard, tour form and contact form (one team alert, customer acknowledgement); every source fails closed (Turnstile, per-IP and per-address limits).
- #40 backlog: proxy `isSitePath` gate, `redirects:languages` Redis hash with a generation-guarded rebuild (works around Next 16.4.5's 308 without `Location`), one `SECURE_ROUTES` list for both CSP policies.
- React 19 form reset fixed with one shared `useSubmitWithoutReset`.
- Verified: 796 unit tests, pgTAP, Turbopack budget (`/tours` 147.7 KB), 60 browser and axe checks; CI green.
- Independent review: approved; targeted re-review approved.

### 2026-11-07 (Phase 5 — 5C: inquiry inbox and emails)

PR #45, branch `feat/p5-inquiries` (migration `20261110110000`).

- UPDATE on `inquiries` revoked; `assign_inquiry()`, `update_inquiry_status()`, `add_inquiry_note(…, contacted)` with role checks and audit rows; `sales_manager` reads every inquiry; `create_quote()` checks the caller may work the inquiry.
- `/admin/inquiries` inbox and detail page; quote prefill from an inquiry; `sendInquiryEmails()` (exactly once, 48-hour cutoff, no personal data in the team alert).
- Verified: pgTAP 25 (59), E2E per role; CI green.
- Independent review: approved.

### 2026-11-07 (Phase 3 — public JS trim)

PR #44, branch `perf/public-js-trim`.

- Sentry route manifest off (it put every route, admin included, into public JS), desktop nav rendered on the server, cookie banner loaded on demand. Every public page lost about 2.3 KB; `/tours` 149.98 → 147.69 KB; new routes no longer grow public pages.
- Independent review: approved.

### 2026-11-07 (Phase 5 — 5A: customer auth, account area, customer-safe reads)

PR #42, branch `feat/p5-accounts` (migrations `20261109190000`, `20261109191000`).

- Customers read and edit only through `customer_bookings()`, `customer_booking()` and `save_customer_travellers()`; the six direct customer policies are dropped (closes the Phase 0 limit).
- Localized sign-in, sign-up, password reset (recovery-session marker), email change and Google (staff refused); account overview, bookings, booking detail, profile; staff `/auth` pages in Vietnamese; starter browser-client forms removed.
- `attach_customer_bookings(target_id)` is service-role only and runs after the autoconfirm guard; `set_marketing_consent()` service-role only with a strict version.
- Verified: pgTAP 24 (46), 143 E2E; CI green.
- Independent review: changes requested (the attach function could be called directly, bypassing the autoconfirm guard), fixed; re-review approved.

### 2026-11-07 (Phase 3 — PR M: SEO completion, CSP, redirects, status codes)

PR #40, branch `feat/p3-seo`.

- #35 backlog first: `onlineBookingAvailable()` (booking button, deposit note and trust bar only when a payment method is configured), `Object.hasOwn` filter keys, desktop filters as a plain section, future-dated posts hidden, contact prefill E2E.
- Real 308 (other-language slug) and 404 (missing or unpublished) via `slugParams()`; sitemap index with per-type sitemaps; `robots.txt`.
- CSP per page type: static nonce-free policy for public pages and `/auth/*`; admin now fully dynamic with a proxy nonce; Sentry in every policy; an E2E fixture fails any test on a CSP violation.
- Redis redirects in the proxy: site-path checks, never decoded, 301/302 only, 50 ms timeout failing open, 60 s cache; Upstash required in production.
- JS budget enforced in CI (`/tours` 149.9 KB); Turbopack proof in CI; shared `zod-config`.
- Known Next.js 16.4.5 issue: after a tag refresh a re-rendered redirect is stored as a 308 without `Location` (browsers follow, crawlers don't until the next build); mitigation planned via Redis.
- Independent review: approved; backlog below.

### 2026-11-07 (Phase 4 — polish)

PR #39, branch `fix/p4-polish` (ADR-038).

- `email-problems-alert` pg_cron job fails on emails stuck in `queued` or recently `failed`; README runbook; staff "resend" for customer emails with a fresh key.
- Single-use emailed access tokens (`booking_access_tokens`, hash only, 7 days); the click sets a fresh signed cookie.
- Payment-link email sent through `after()`.
- Independent review: approved.

### 2026-11-07 (Phase 5 — spec)

PR #37, branch `docs/p5-spec` (ADR-037).

- `docs/specs/phase-5-accounts-inquiries-operations.md`: Stream A PRs 5A–5D (customer auth and account area, customer-safe reads, booking lookup, inquiry inbox, reminders, alerts, dashboard, CSV, deletion and export), Stream B PR 5W (tailor-made wizard).
- Independent review: changes requested (booking attachment relied on a hosted setting; deletion missed tables; stored overdue flag; inquiry permissions beyond the matrix), fixed; re-review approved.

### 2026-11-07 (Phase 4 — 4E: transactional emails)

PR #36, branch `feat/p4-emails` (ADR-036; migrations `20261109170000`, `20261109171000`).

- VI/EN templates (booking received, payment received, booking confirmed, payment link, balance reminder, cancelled) plus a staff alert; `@react-email/render` with in-house primitives (the component packages are deprecated).
- Exactly once: the `email_logs` row with a unique `dedupe_key` is written before the Resend call; sending runs after the commit through `after()`, keyed on `booking_events`. Without Resend every email is a `skipped` row; logs keep only the status code.
- Emailed checkout links carry the booking's access token; only a button press sets the cookie (mail scanners see nothing).
- #34 backlog closed: quotes for private tours only, snapshot title fallback, a Sentry `transaction` leak of `/en/pay/<token>` fixed, a used link offers the existing checkout.
- Verified: 681 unit tests, pgTAP 21 and 22, CI green.
- Independent review: approved; backlog below.

### 2026-11-07 (Phase 3 — PR L: tour listing and site search)

PR #35, branch `feat/p3-listing`.

- `/tours`: every filter in the URL (search, scope, destination with children, style, price, month, duration, five sorts, page), 12 per page, mobile filter sheet, loading, empty and error states; filtered pages `noindex` with canonical `/tours`; ItemList JSON-LD.
- `/tim-kiem` (`search_site()`, invoker, published rows only); "see all" links from destination and style pages.
- Booking box links group tours to the booking page (`bookingHref`); `features.booking` on; booking lookup link behind `features.bookingLookup`.
- Seed grows to 31 VI and 29 EN tours. Initial JS: `/tours` 149.8 KB (0.2 KB under the budget).
- Independent review: approved; backlog below (the trust bar and booking box must not claim online payment before it is configured, fixed in PR M).

### 2026-11-07 (Phase 4 — 4D: quotes and payment links)

PR #34, branch `feat/p4-quotes` (migration `20261109150000`).

- `create_quote` (sales roles and admin at aal2), `create_payment_link` (256-bit token stored as SHA-256, amount due now, capped at the quote's expiry), `redeem_payment_link` (single use under a row lock); `/admin/bookings/new` and a payment-link panel; customer page `/thanh-toan/link/[token]` consumes the link only on the button press.
- Verified: pgTAP 20; E2E from quote to paid link and a reused link; CI green.
- Independent review: approved; backlog closed in #36.

### 2026-11-07 (Phase 4 — 4B: book-now flow and checkout)

PR #32, branch `feat/p4-checkout` (migration `20261109140000`).

- Secure root `src/app/(secure)/[locale]`: fully dynamic, nonce CSP with `strict-dynamic` from the proxy (ADR-027).
- `/dat-tour/[tourSlug]` (server prices, Turnstile, rate limits with `failOpen`), `/thanh-toan/[code]` (VNPay redirect, VietQR, real hold countdown), result page polling `booking_checkout_status()`; signed `booking_access_<code>` cookie; `create_checkout_draft()` writes draft and consent in one transaction; a stale draft price is repriced on Pay.
- `z.config({ jitless: true })` because Zod's probe breaks under the nonce CSP.
- Independent review: changes requested (major: a draft whose price changed could never be paid), fixed; re-review approved.

### 2026-11-07 (Phase 3: PR K, pages, journal, reviews, contact)

PR #31, branch `feat/p3-pages` (spec steps 15–16; PR #30 review minors).

- Done:
  - About, FAQ (`FAQPage`) and policy pages by per-language slugs.
  - Journal list, topics and articles (`Article`).
  - Reviews page (approved only).
  - Contact page with the form saved as an inquiry (`create_contact_inquiry()`, team email; Zod, fail-closed rate limit, Turnstile; disabled without keys or a published privacy policy).
  - Consent is recorded with the version of the published privacy text, for the newsletter too (ADR-035). The Turnstile re-submit fix is shared by both forms.
  - Footer and banner policy links use real slugs. The booking box and tailor-made links open the contact page. Sample content added to the seed.
  - #30 minors: hreflang only where the destination is reachable; "48 of N".
- Verified locally: lint, typecheck, 611 unit tests, pgTAP (31: 12), production build, axe at 375/1280 px. CI: E2E.
- Known issue closed: footer and banner policy links built from page keys.
- Owner-blocked: Turnstile, Upstash and Resend for the contact form.
- Independent review: approved; minors fixed before merge (migration order, Turnstile token, consent version from the privacy page, ADR-035).

### 2026-11-07 (Phase 3 — PR J: destinations and travel styles)

PR #30, branch `feat/p3-destinations` (spec steps 13–14; PR #24 review minors).

- Done:
  - `/diem-den` with countries, regions, places and tour counts; destination pages (summary, best time, places below, rich content, tours of the destination and below); travel style pages (tours, other styles); metadata, hreflang, BreadcrumbList and ItemList JSON-LD, error states; the homepage cards and menus open them.
  - `rateLimit({ failOpen })` (default closed, newsletter closed, Phase 4 open and logged; ADR-029); hero text at 4.5:1 over photos; newsletter pgTAP moved to the 3x range.
  - Docs name the moved public tree.
- Verified locally: lint, typecheck, 566 unit tests, pgTAP, production build, axe at 375/1280 px; CI: E2E.
- Deviations: counts from anon reads (no migration); pages list up to 48 tours.
- Independent review: approved; two minors fixed in #31.

### 2026-11-07 (Phase 4 — 4F: admin bookings and payments)

PR #29, branch `feat/p4-admin-bookings` (migrations `20261109130000`, `20261109131000`).

- Role-checked definer functions: `record_manual_payment`, `record_refund` (capped, note required, accountant or admin at aal2), `assign_unmatched_transfer` (webhook amount, assigned once), `staff_cancel_booking` (audited), `request_cancellation`, `resolve_attention` with `attention_resolvers()` (money reasons: accountant or admin at aal2; cancellation requests: operator or admin).
- `/admin/bookings` (filters, detail with lines, travellers, payments, timeline, role-gated actions), `/admin/bookings/attention`, `/admin/payments` (ledger, unmatched transfers), dashboard counts; README runbooks.
- Verified: pgTAP 18 (39), concurrent refunds probed (second refused), E2E for sales, operator and aal2 accountant; CI green.
- Independent review: changes requested (sales could clear money flags), fixed with `attention_resolvers()`; re-review approved.

### 2026-11-07 (Phase 3: public route group)

PR #28, branch `chore/p3-public-route-group`.

- Done: moved `src/app/[locale]` to `src/app/(public)/[locale]` (`git mv`; one import path), ready for Phase 4's `(secure)/[locale]` root.
- Verified: lint, typecheck, unit tests, production build with an unchanged route table; CI.
- Independent review: approved (mechanical move).

### 2026-11-07 (Phase 4 — 4C: payment gateways)

PR #26, branch `feat/p4-gateways`.

- `PaymentProvider` interface; VNPay sandbox adapter (HMAC-SHA512 checked against an independent vector, `vnp_TmnCode` and amount checks, success from both result codes, responses 97/01/04/02/00/99, return page display only); VietQR payload; SePay/Casso webhook (constant-time key check, incoming credits only, reference tokens including spaced or dashed ones).
- Off modes never record money; `VNPAY_STUB` is refused in production and signs its IPN with the configured secret.
- Verified: unit tests and E2E in CI.
- Independent review: approved; cheap backlog fixed before merge; go-live checks listed in the spec.

### 2026-11-07 (Phase 4 — 4A: booking core)

PR #25, branch `feat/p4-booking-core` (migrations `20261109110000`, `20261109120000`).

- `pricing.ts` (integer dong, deposit rounding) and `state-machine.ts`.
- Service-role definer functions: drafts (prices rechecked against the departure, party rules), `reserve_and_create_payment` (conditional seat update, `price_changed`, `sold_out`, method switch), `record_payment_event` (idempotent via `webhook_events`; extra rows flagged for attempts that are no longer pending; late payments; never confirms a cancelled booking), `expire_holds` (`skip locked`), cancellation, completion, `check_seat_invariant` with a failing alert job; `pg_cron` schedules.
- Verified: pgTAP 16 (80) and 17; E2E for the last-seat race (one hold, one `sold_out`) and ten identical IPNs (one payment); two-session deadlock regression in CI.
- Independent review: changes requested (deadlock between `expire_holds()` and a concurrent payment, reproduced), fixed with `skip locked` and a retry mapping; re-review approved.

### 2026-11-07 (Phase 3 — PR I: homepage)

PR #24, branch `feat/p3-homepage` (Phase 3 spec PR I, ADR-029; PR H backlog).

- Done:
  - Homepage from one cached anon read: hero (navy band unless the image exists and is described in the page's language), search form without JS, trust bar, featured tours, destinations, travel styles, testimonial, tailor-made call to action, newsletter; journal teaser built but hidden until PR K. Metadata, hreflang, `TravelAgency` JSON-LD and a generated Open Graph image per locale.
  - Newsletter double opt-in: Zod, honeypot, rate limits, Turnstile, service-role functions; only token hashes stored; confirmation by button; marketing consent recorded. Disabled and refusing every request until the owner's Turnstile, Upstash and Resend keys exist.
  - Initial JS: home 179 → 147 KB, tour page 194 → 147–149 KB gzip (mega menu without Radix, no next-intl client on public pages, no `next/image` client code).
- Verified: lint, tsc, 519 unit tests, pgTAP; CI green (90 E2E).
- Independent review: approved; backlog below.

### 2026-11-07 (Phase 4 — spec)

PR #23, branch `docs/p4-spec` (ADR-033).

- `docs/specs/phase-4-booking-payments.md`: 16 decisions, PRs 4A–4F, an off mode for every missing account (never confirming money), a signed VNPay stub for CI, and the cross-stream route-group move.
- Independent review: changes requested (two majors on recording money: success events for attempts that are no longer pending; bank webhooks counting outgoing transfers), fixed; re-review approved.

### 2026-11-07 (Phase 2 — polish and acceptance)

PR #22, branch `fix/p2-polish`.

- `set_tour_links()` writes a tour's links in one transaction; tours can remove a language (301 to the other language or the list); publishing a tour language removes a redirect from that path; `PageHeader` is a named region.
- Acceptance E2E `tour-publish.spec.ts`: an editor builds a full VI/EN tour (photos, hero, gallery, day photos, destination, style), publishes it, and both public pages show it. The first departure is created through the service role, standing in for the admin step ADR-024 requires.
- Independent review: approved.

### 2026-11-07 (Phase 2 — PR G: settings, staff, dashboard)

PR #20, branch `feat/p2-settings-staff` (spec steps 21–23, ADR-032; PR 17 and PR 18 backlog). The last Phase 2 PR.

- Done:
  - Backlog: redirect chain lock; `create_redirect()` and `record_slug_redirect()` in one transaction each; Redis 3 s timeout and atomic resync; both Upstash variables or neither; alt text kept for images in published destination descriptions, tour itineraries and the homepage hero (`is_homepage_hero()`).
  - `/admin/settings` (admin, aal2): company, contact, social, bank account, booking rules (`booking_cutoff_days` 0–60), homepage picks; bank account and booking rules can never be public.
  - `/admin/staff` (admin, aal2): invitations through the Auth Admin API (audited, rolled back on failure), role changes and deactivation with the admin's session; nobody demotes themself or the last active admin (database rule with a lock); audit log filter by actor.
  - Role-aware dashboard with shortcuts to the sections each role can use.
- Verified: lint, tsc, 404 unit tests, pgTAP in 13 files locally; CI green on 24fdcad (incl. an E2E admin who enrols TOTP, edits settings, invites a user who accepts from the Mailpit email, changes their role and deactivates them). The CI types check now prints the full diff.
- Independent review: approved; first CI run failed (types separator, an ambiguous locator) and was fixed with the review minors.
- Owner dependency: hosted Supabase needs SMTP (Resend) and the invitation template before staff can be invited outside local and CI.

### 2026-11-07 (Phase 3 — PR H: tour detail)

PR #18, branch `feat/p3-tour-detail` (`docs/specs/phase-3-public-site.md` steps 1–9).

- Done:
  - `search_tours()`, `tour_departures()` and `booking_cutoff_days()`, with 20 pgTAP assertions;
  - shared image, JSON-LD, breadcrumb, alternates and tour card pieces;
  - cached tour page read with live departures and booking box in Suspense, hreflang for published languages, Product/TouristTrip JSON-LD, tour reviews, other-language slug redirect;
  - interim `/tours` list;
  - staff tour preview and itinerary day photos;
  - JS budget warning in CI;
  - CSP spike (ADR-027: option 2).
- Verified: lint, tsc, 379 unit tests, pgTAP 247 locally, webpack production build; stub screenshots and axe at 375 and 1280 (0 violations); live error state; E2E in CI.
- Deviations: 404/308 are streamed (HTTP 200 + noindex); the booking box calls or emails until PR K and Phase 4; the mega-menu deferral moves to PR I.
- Independent review: approved. The 404/308 status counts as **fail** for the Phase 3 criterion and is a tracked PR M item; the day-photo alt rule moved into the database in #20.

### 2026-11-07 (Phase 2 — PR F2: reviews, redirects, subscribers)

PR #17, branch `feat/p2-reviews-redirects` (spec steps 19–20, ADR-031; PR 16 backlog; step 8 follow-up).

- Done:
  - Definer helpers are gated to staff and trusted roles, media usage is case-insensitive, and published articles cannot be deleted (`20261108125000`).
  - Reviews: staff change only status and featured; featured means approved; staff-written reviews are never verified.
  - Redirects:
    - site paths, no loops or chains;
    - Redis hash `redirects` synced on every save and slug change, with resync, as a logged no-op without Upstash.
  - Subscribers: read-only list; CSV export of active subscribers only, written to the audit log first.
  - Destination rich-text description.
- Verified locally:
  - lint, typecheck, 358 unit tests, production build;
  - pgTAP 227 assertions (06: 33, 07: 9, 08: 9).
  - CI green, E2E included.
- Deviations: Redis via a `fetch` client rather than an SDK; the admin offers 301/302 only; the export covers active subscribers only.
- Independent review: approved; backlog below (fixed first in PR G).

### 2026-11-07 (Phase 2 — PR F1: rich text, journal, pages)

PR #16, branch `feat/p2-content` (spec steps 17–18, ADR-030; PR 13 backlog).

- Done:
  - Departure rules: the tour row is locked before the last-departure and publish checks (concurrent removals were checked by hand); the booking helper is limited to booking roles; the calendar's month links are clamped; pgTAP covers moving a departure to another tour.
  - Tiptap editor with decision 7's fixed set; a shared sanitizer (`src/lib/rich-text.ts`) and a server-only `RichText` renderer for public pages.
  - Journal (articles, topics) and the six static pages with VI/EN publishing; content rules in `20261108120000_content_rules.sql`; images used inside JSON cannot be deleted.
- Verified locally: lint, typecheck, 332 unit tests, pgTAP 200 assertions (06: 24; dropping the triggers fails 14), production build; CI green with 68 E2E (4 new).
- Deviations: published articles need a cover and must be unpublished before deletion; the destination rich content field moves to F2.
- Independent review: approved; backlog fixed in PR #17.

### 2026-11-07 (Phase 3 — spec and Claude Design)

PR #15, branch `feat/p3-spec-design`.

- Done: design system "Premium Travel Agency" and the Phase 3 mockups in Claude Design (home, listing, tour detail at 1440 and 390 px); `docs/specs/phase-3-public-site.md` with 20 recommended decisions and PRs H–M.
- Verified: docs only; CI.
- Deviations: `search_tours()` moves from the listing PR into PR H; the listing gains a travel-style filter for the hero search.
- Independent review: changes requested (nonce CSP cannot work on prerendered routes), fixed with ADR-027 (fully dynamic admin with a proxy nonce, spike: 0 violations) and ADR-028; re-review approved.

### 2026-11-07 (Phase 2 — PR E: departures)

PR #13, branch `feat/p2-departures` (spec steps 14–16, ADR-026).

- Done:
  - `/admin/departures`: table and month calendar, filtered by tour, status and month; seats shown as reserved / capacity.
  - Bulk creation: weekday pattern or a list of dates, with a server preview; duplicates are skipped and reported; prices copied from the latest departure for non-admins.
  - Editor: status, capacity (never below the reserved seats), note, admin-only prices, delete.
  - Migration `20261108100000_departure_rules.sql`: capacity check; cancel and reopen only by an MFA-verified admin and never with pending or confirmed bookings; a published group tour keeps a departure that is not cancelled (closes the PR 11 backlog item).
- Verified: lint, typecheck, 298 unit tests, pgTAP 171 assertions locally (05: 18; dropping the trigger fails 7), production build; CI green incl. 64 E2E (3 new: operator bulk create, edit, delete; calendar; read-only sales).
- Deviations: minimum travellers is read-only on the departure (it is a tour field); dates cannot be edited after creation; the admin-only paths are tested in pgTAP and unit tests, not E2E.
- Independent review: approved; backlog below.

### 2026-11-07 (workflow — ADR-025: parallel streams, messages per area)

Branch `chore/parallel-workflow`.

- ADR-025 (owner: "apply all 4"): two parallel streams with their own agents and worktrees, parallel migrations on different tables, focused reviews with a phase backlog, lighter progress entries and local visual checks for public pages only.
- UI strings split into `messages/<locale>/<area>.json`, merged by `src/i18n/messages.ts` (duplicate keys fail); files for the next streams are created empty. The parity test now also checks that every file is listed.
- Verified: lint, typecheck, unit tests, production build.

### 2026-11-07 (Phase 2 — PR 11: tours)

Branch `feat/p2-tours` (`docs/specs/phase-2-catalog-admin.md` steps 11–13, ADR-024).

- Done:
  - Migration `20261107100000_tour_rules.sql` (ADR-024):
    - price guards: only an MFA-verified admin sets tour prices, deposit, balance terms and cancellation policy, and departure prices; editors' new tours get the defaults, operators' new departures copy the prices of the tour's latest departure, and a tour's first departure needs an admin;
    - publish rules: a published tour needs a published translation, a hero with VI/EN alt text and a price (a departure for group tours, a from price for private tours); a published translation needs a title, summary and SEO description; a published tour keeps its hero and its last published language;
    - heroes of published destinations and travel styles keep both alt texts, and an image used as one cannot lose them;
    - tour code format.
    - pgTAP: 30 assertions for editor, operator, sales manager and admin with and without aal2; dropping the triggers makes 15 of them fail.
  - Seed and access-test fixtures insert tours as drafts and publish them once complete (with sample hero image rows).
  - `/admin/tours`: list for every staff role (edit links for editors and admins only), search by code or title, status/type/scope filters, per-language state and next departure.
  - `/admin/tours/new`: a draft from a title and the key facts.
  - Tour editor: general facts, prices and terms (admin only, read-only otherwise), destinations and travel styles, hero and an ordered gallery, VI/EN content with itinerary day cards, highlights, inclusions, exclusions, practical information, FAQs, SEO and sharing image, per-language publishing and the tour status.
    - Saving publishes in an order the database accepts (content and links first, status last; the reverse when unpublishing), sends prices only for admins, adds 301s language by language, refreshes the `tours` cache tag and maps the database rules back to their fields.
  - Duplicate: content, images and links as an unpublished draft with free slugs, no departures.
- Verified locally:
  - lint, typecheck, 256 unit tests (schemas, including parsing their own output again; save order, admin-only prices, publish checks, hero alt and kept languages, link diffs, cache tags, redirects, error mapping, duplication);
  - pgTAP on the local Postgres shim: 153 assertions;
  - production build.
  - Signed-in E2E (CI only; results in the PR): editor filters, creates a draft, is refused publishing without a language and a hero, saves the itinerary; duplication; operators read without edit links; the aal2 admin edits a from price.
- Deviations:
  - Gallery reordering uses move buttons (keyboard and screen-reader friendly) instead of drag and drop.
  - Day images in the itinerary and the signed preview link move to Phase 3 with the public tour page.
- Independent review: changes requested, addressed:
  - Major: the media picker search and the media edit dialog submitted the tour editor form through the React tree (portal); both now stop the event.
  - Minor: a translation cannot move to another tour; the hero alt text is checked before anything is written; a failed publish keeps an archived tour archived; new tours get the default policy for admins too; clearing a saved language's title is refused (`keepLanguage`) instead of deleting it; links are diffed (gallery upserts before removals); the `tour:<id>` tag is refreshed; the media dialog explains a hero alt refusal; focus moves to the next row (or the add button) after a removal; E2E locators scoped to the seeded row and the page header.
  - Nits: `default_cancellation_policy_id()` is security invoker; audit entity ids use `z.guid()`; the read-only price uses `formatVnd`; English copies get `-copy` slugs; the default copy code fits the format; the form alert is announced again on a second failed save.
  - Left for PR E: the publish rules do not stop an operator cancelling a published group tour's last departure.

### 2026-11-07 (Phase 2 — PR 10: destinations, travel styles, cancellation policies)

Branch `feat/p2-taxonomy` (`docs/specs/phase-2-catalog-admin.md` steps 8–10).

- Done:
  - Migration `20261106150000_taxonomy_rules.sql`:
    - `is_valid_slug()` checks on the six translation tables;
    - destination tree triggers (country → region → city, no type change while a parent has children);
    - destination and travel-style translations cannot be published without a name and summary/description;
    - `is_valid_cancellation_rules()` (1–10 tiers, days falling to 0, refunds never growing; missing keys, non-objects and nulls refused);
    - keys of published destinations and travel styles locked by a trigger;
    - a single default policy, moved in one transaction by `set_default_cancellation_policy()` (security invoker) and never switched off or deleted (deferred constraint trigger).
    - pgTAP: 28 assertions.
  - `src/modules/catalog/taxonomy`: Zod schemas, repository, service and Server Actions.
    - Keys are fixed once published.
    - Publishing with a hero image needs its VI/EN alt text.
    - A changed slug on a published translation adds a 301.
    - Cache tags `destinations`, `travel-styles`, `cancellation-policies`.
    - A new item whose translation fails to save is removed again, so a retry does not hit "key taken"; an existing one keeps what was saved, gets its redirects language by language and has its cache tag refreshed.
    - Editing a policy raises its version; the default flag moves only after the policy has saved.
    - Database errors are mapped back to their fields.
    - Server Actions check the permission before reading the input.
  - `/admin/destinations`: the tree with per-language publish state, plus links to add a region or city under a parent.
  - Create and edit forms (React Hook Form + Zod on the raw input, server errors put back on fields; the tab holding the errors opens and the first one is focused):
    - VI/EN tabs that show missing fields;
    - slug generation and an availability check on blur;
    - SEO fields and a publish switch per language;
    - hero image from the MediaPicker;
    - delete refused while tours or children use the item.
  - `/admin/travel-styles`: the same pattern as a flat list.
  - `/admin/cancellation-policies` (admin only): rules table, version and usage; editor for refund tiers, VI/EN summaries and the default flag.
  - Shared pieces: `AdminMessages` gives a page's client components only its admin strings; `FormField` accepts schemas that transform values; `StatusBadge` maps `publish_status`.
- Verified locally:
  - lint, typecheck, 234 unit tests (schemas, including parsing their own output again; service rules; action order);
  - pgTAP on the local Postgres shim: 122 assertions, all four files;
  - production build.
  - The destination tree, the destination, travel style and policy forms (empty and with errors) were rendered against the REST stub with a temporarily faked admin (not committed): no axe violations at 1280 or 375 px. The narrow layout of the policy rules was fixed after the screenshots.
  - Signed-in E2E (CI only; results in the PR): the editor builds and deletes a country → region branch with the publish checks; a slug already in use is caught on blur; editor and operator are blocked from the pages they cannot use; the aal2 admin creates a policy, and rules out of order are refused.
- Deviations:
  - The policies live at `/admin/cancellation-policies` (Settings links to them in PR G).
  - The destination rich `content` field gets its editor with the RichTextEditor in PR F; public pages use the summary until then.
  - Decision 3 asks for an SEO description before a translation is published. For destinations and travel styles the summary or description is required instead, and public pages fall back to it for the meta description. Tours (PR D) keep the stricter rule.
- Independent review: changes requested.
  - Critical: the forms sent Zod's parsed output (empty text already `null`) and the server's second parse refused it, so new items could not be saved.
  - Major:
    - the rules check let missing keys through (NULL);
    - a failed save could lose a slug redirect and leave the cache stale;
    - two E2E locators were ambiguous (the Next.js route announcer, a hidden previous page).
  - Minor: SEO errors and limits invisible, hidden-tab errors, unreadable numbers saved as nothing, the default policy could disappear, a key lock that only the service enforced, wrong error fields, the slug check racing.
  - All addressed as above. The hero alt-text rule is still enforced by the service only, and clearing the alt text of an image in use is not blocked; both move into the publish trigger of PR D (known issues).

### 2026-11-06 (Phase 2 — PR 9: media library)

Branch `feat/p2-media` (`docs/specs/phase-2-catalog-admin.md` steps 5–7).

- Done:
  - Uploads in two steps (ADR-023): a Server Action signs an upload URL into the private `media-uploads` bucket (`pending/<user id>/<uuid>.<ext>`), and the browser sends the original there directly. A second Server Action checks that the file is the user's own, its real type from the first bytes (JPEG, PNG, WebP, AVIF with AV1 data; SVG, HEIC and disguised files are refused), its size (20 MB), dimensions (12 000 px) and pixel count (50 MP, 24 MP for AVIF), re-encodes it with `sharp` (orientation applied, EXIF/GPS and appended bytes dropped, colour profile kept), makes a 16 px WebP blur placeholder, writes only that clean copy to the public `media` bucket with the service role, records it and deletes the staged original. Every action calls `requirePermission("media.manage")`.
  - Migration `20261106145000_media_uploads_bucket.sql`: the private staging bucket (no API-role policies), staff insert and update on the public `media` bucket removed (list and delete stay), `media.original_name` for search, staff updates limited to alt text and credit, and checks that every row has a server-generated path, an image type and a WebP data-URL placeholder. pgTAP: bucket exists and is private, no policy opens it, editors cannot write to either bucket, cannot see staged uploads or overwrite media, and keep only the list and delete policies.
  - `/admin/media`: grid with search by alt text or the uploaded file name (PostgREST filter syntax stripped), paging, VI/EN alt text and credit, small-image and missing-alt badges, delete only when nothing uses the image (foreign keys; friendly error; the file is removed only when the row really was), focus returns to the page after a delete, toasts in the admin shell.
  - MediaPicker dialog (search, load more that keeps focus, stale results ignored, inline upload with the new image selected, single or multiple, missing-alt badge read with the image name) and a demo on the design system page.
  - `src/lib/logger.ts` (JSON log lines, no personal data).
- Verified locally: lint, typecheck, unit tests (type sniffing, schemas, actions returning `forbidden`/`invalid`, and the service with real `sharp` images: rotated originals, EXIF/GPS and an appended script removed from the published copy, an SVG renamed .png, a JPEG under a .png name, a corrupt PNG, a 56 MP image, a real AVIF, another user's staged file, double finalize, failed recording cleaning up the public copy, delete in use and delete of zero rows); pgTAP on the local Postgres shim (94 assertions); production build. Storage itself is exercised only by the CI E2E (upload, refusal of a disguised SVG, public path of the clean copy, search by file name and alt text, delete, picker, operator blocked), since Supabase containers cannot run here.
- Independent review: changes requested (major: files were uploaded straight into the public bucket and stayed public before, or without, the server's checks), addressed with the staging bucket and re-encoding above, together with the minor findings (pixel and AVIF memory limits, delete removing files when RLS kept the row, file-name search, uploader focus ring and live region, picker announcements, focus and race, action tests) and nits (`safeParse` in `browseMedia`, public URLs without a client per row, long cache on published copies, exact E2E locators). Deferred with a place in the spec: usage checks for image ids inside JSON (PRs D and F), `ResponsiveImage` (Phase 3).

### 2026-11-06 (Phase 2 — PR 8: spec, admin shell, building blocks, audit log)

Branch `feat/p2-admin-shell` (`docs/specs/phase-2-catalog-admin.md` steps 1–4).

- Done:
  - Phase 2 spec with the recommended defaults (price-column guards, audit trigger, publishing checks, slugs and redirects, media checks, rich-text whitelist, staff invitations, cache tags), taken under the owner's standing instruction.
  - AdminShell: sidebar built from the permission matrix (items a role cannot use are hidden and still blocked on the server), a sheet below `lg` that returns focus to its button, top bar with user, role, MFA state and sign-out, skip link, PageHeader with breadcrumbs. The overview page now lives inside the shell.
  - DataTable and FilterBar: list state in the URL (`parseListParams`/`listHref`, unit-tested, unknown values fall back to defaults), sortable headers as links with `aria-sort`, a GET filter form that works without JavaScript.
  - Form blocks: LocaleTabs, SlugInput (`slugify` removes Vietnamese diacritics including đ; unit-tested), SeoFields, MoneyInput (`parseDongInput`/`formatDongInput`, unit-tested), ConfirmDialog, ListEditor.
  - Audit: migration `20261106140000_audit_triggers.sql` (generic `audit_row_change()` trigger on 23 tables), 13 pgTAP assertions, `/admin/audit-log` (admin at aal2) with entity filter, sort and paging; the list streams in its own Suspense boundary.
  - E2E: admin opens the audit log from the menu (`aria-current`), filters by entity, axe clean; editor has no audit link and gets a 404; the mobile admin menu sheet returns focus. axe helper shared in `tests/e2e/support/axe.ts`.
- Verified locally: lint, typecheck, unit tests; pgTAP on the local Postgres shim (82 assertions, and dropping the triggers makes the audit assertions fail); production build; the shell, the audit page and the admin form blocks rendered with a temporarily faked staff user (not committed) at 1280 and 375 px with no axe violations. Signed-in E2E runs in CI.
- First CI run: two E2E failures (an ambiguous "Đối tượng" label in the test; a link directly inside a `<dl>` group on the overview, flagged by axe), both fixed.
- Independent review: changes requested, all addressed:
  - Major: the overview `<dl>`; list-editor buttons submitting forms (IconButton now defaults to `type="button"`); profile audits copying personal data (now names only, values only for role/status); spec decision 1 allowing delete-and-recreate at a new price (now insert guards, prices copied from the tour's latest departure, ADR-024 with PR D); `parseDongInput` silently accepting decimals, signs and exponents (strict grouping, unit-tested); a vacuous pgTAP null-actor check.
  - Minor: `audit_logs.actor_id` now `on delete set null`; IP/user-agent capture dropped (it would record the server); seat-only departure changes not logged; a page past the end shows an empty page instead of an error; admin error page; non-UUID entity search explained; form blocks shown and tested on the design system page; list editor keeps focus on moved rows and announces moves and removals; confirm dialog shows failures; slug errors announced; spec gaps (redirect resync, identity audit rows, publish checks in both directions, sharp) written into the spec. Deferred with a place in the spec: actor filter (PR G), status badges and row actions (PRs C–E), slug uniqueness checks (with each editor).

### 2026-11-06 (Phase 1 — PR 7: primitives, design system page, axe)

Branch `feat/p1-primitives` (`docs/specs/phase-1-design-system.md` steps 12–14).

- Done:
  - Primitives: textarea, select, radio group, tooltip, popover, tabs, separator, avatar, skeleton, spinner, alert, toast (Radix) with a small `Toaster`/`toast()` store, pagination (real links; page range unit-tested), icon button (required label), form (React Hook Form + Zod; Zod messages are translation keys), tag, status badge (one colour map for every status enum, unit-tested) and empty state. DatePicker, Combobox, PhoneInput and Stepper wait for their forms (Phases 2 and 4).
  - `/admin/design-system`: tokens, the type scale with Vietnamese diacritics, every button, badge and status, a validated form, overlays, toasts, feedback states, pagination and a navy section. Staff only; 404 in production builds unless `SHOW_DESIGN_SYSTEM=true` (set in CI).
  - axe (`@axe-core/playwright`, WCAG 2.2 AA tags) in E2E: `/`, `/en` and a 404 at 375 and 1280 px with the cookie banner open and after a choice, the cookie settings dialog, the mobile menu, the mega menu, and the design system page signed in as an editor (also with form errors). Serious or critical violations fail CI.
  - ADR-022 (`@hookform/resolvers`, `@axe-core/playwright`, Radix packages).
- Verified locally: lint, typecheck, unit tests; production build; the public axe tests (12) against the REST stub. The design system page was checked in a dev server with the staff gate temporarily bypassed (not committed): axe found no violations at 1280 and 375 px, also with form errors, and screenshots with the real Cormorant Garamond and Be Vietnam Pro fonts (from npm, since Google Fonts is blocked here) show no clipped diacritics at any size. The signed-in axe test runs in CI.
- Found and fixed while checking: the toast store's server snapshot was not a stable reference (React warned of an infinite loop); axe flagged Radix NavigationMenu's focus sentinel (see known issues).
- Independent review: approved with minor findings, all addressed: a removable `Tag` requires its remove label (type-level); form fields reference only descriptions and messages that exist, and the message live region is never `display:none`; `Alert` has no live role unless asked (`live`) and its title is a paragraph (no heading jumps); active tab uses the tested 3:1 gold with a semibold label; focus rings have offsets everywhere; error toasts stay until closed and toasts are announced as "Thông báo" in a "Thông báo (F8)" region; the design system flag is a unit-tested helper and the page is documented as never for Vercel Production (`README.md`, `.env.example`); axe also runs with the select list, a dialog and an error toast open (scoped to the overlay, after animations finish); ADR-022 records that it was accepted under the owner's standing instruction.

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

- Phase 6 privacy work: `media.original_name` can contain personal data (a person's name in a file name) and is copied into `audit_logs`; cover it in the privacy policy and the deletion procedure.
- Build cache after a Supabase outage (seen once locally): a webpack build with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9` succeeded with an empty shell; a second webpack build a few minutes later with the URL changed to the local stub, reusing `.next/cache`, served an empty 404 page until `.next` was deleted. The review found only compiler caches in `.next/cache`, so the baked-in `NEXT_PUBLIC_` URL change is the likely cause, not cached data. Re-check against the default Turbopack build on the first Vercel preview (Vercel restores `.next/cache`); if it appears there and the 30 s re-render does not repair it, treat it as a major bug.
- The theme switcher is no longer rendered; next-themes stays installed for a possible admin dark mode (ADR-017).
- Phase 6: add `includeSubDomains; preload` to HSTS once the production domain is fixed.
- When performance tracing is wanted: add a `beforeSendSpan` that redacts span names and URL attributes, with a test, then set `tracesSampleRate` and drop `excludeTracing` in `next.config.ts`.
- Phase 6 legal pages: the privacy policy must name Sentry as a processor (the CSP already allows its ingest host, `src/lib/csp.ts`).
