# TASK-P6: Hardening and launch

Phase 6 of `DEVELOPMENT_PLAN.md`. Phases 0–5 built the site; this phase makes it safe to run for real customers' money and data, then launches it. It covers a security review with evidence, monitoring that someone actually reads, housekeeping jobs, analytics behind consent, real content and legal pages, quality checks on real devices, a rehearsed restore, VNPay production sign-off, staff acceptance and the production deployment. It ends with a launch checklist that must be 100% before the domain points at production.

Two streams (ADR-025). Stream A: database, security, operations. Stream B: public site, SEO, analytics, consent. Much of the phase needs the owner's accounts and decisions; those items are listed exactly in "What the owner must provide" and are never faked in code.

## Inputs

- `DEVELOPMENT_PLAN.md` Phase 6 and "Definition of done"; `FEATURES.md` "Cross-cutting".
- `ARCHITECTURE.md`: "Security" (payments, auth and access, Supabase, application, personal data and compliance), "SEO", "Performance", "Monitoring", "Environments".
- `DATABASE.md`: "RLS policy summary", "Postgres functions", `consent_records`, `booking_access_tokens`, `email_logs`, `webhook_events`; storage buckets `media`, `media-uploads`, `private`.
- ADRs: 004, 009 (roles, MFA), 012 (seat holds and payments in Postgres), 013 (VNPay, VietQR), 017–018 (hosting), 023 (staged uploads), 027 (CSP per page type), 029 (rate-limit fail modes, Turnstile), 033, 035 (consent versions), 036 (transactional email), 037 (accounts, deletion, operations jobs), 038 (single-use emailed links).
- "Before go-live" in `docs/specs/phase-4-booking-payments.md` and `docs/specs/phase-5-accounts-inquiries-operations.md`.
- `PROGRESS.md` backlog and known issues tagged Phase 6, listed in decision 14.
- `PROJECT_BRIEF.md` §9 (what only the owner can provide); `README.md` "Deployment" and "Runbooks".

## What the owner must provide

Nothing in this list can be produced by the team. Each item names the step it unblocks. Code ships with an off mode for each (as in Phases 4–5); launch waits for all of them.

| # | Item | Unblocks |
| --- | --- | --- |
| 1 | Brand name, logo (SVG and PNG), favicon, final domain, and whether an existing site's URLs must be redirected (SEO migration) | content, metadata, OG images, redirects (6Q), HSTS preload and DNS (6L) |
| 2 | Company details for the footer: legal name, tax code, address, tour-operator licence number, Ministry of Industry and Trade e-commerce notification link (approved) | legal footer (6Q); launch is not legal without the licence and the notification |
| 3 | Bilingual content: tours with departures and prices, destinations, travel styles, journal articles, About, FAQ; photography with usage rights (originals ≥ 2400 px) | real content (6Q), Lighthouse on real pages (6Q) |
| 4 | Legal texts reviewed by counsel in both languages: terms, privacy policy (decision 7 lists what it must cover), cancellation policy, payment policy; the actual deposit rate, balance due period and refund tiers | policy pages, booking rules in Settings, consent versions (ADR-035) |
| 5 | Vercel Pro team and project; Supabase Pro organisation with a **staging** and a **production** project in Singapore, the **PITR add-on** on production | everything in 6C and 6L |
| 6 | Resend account and DNS access to add SPF, DKIM and DMARC for the sending domain | Auth emails, transactional emails |
| 7 | Upstash Redis database (Singapore), Cloudflare Turnstile site (production domain), Sentry organisation and project | rate limits, redirects, forms, error monitoring |
| 8 | VNPay merchant contract with sandbox and production credentials, the production IPN URL registered with VNPay, and VNPay's test-case sign-off | VNPay go-live (decision 9) |
| 9 | Receiving bank account and the choice of SePay or Casso, with its API key and the webhook registered | bank transfer go-live |
| 10 | Google: GA4 property (measurement ID), Search Console for the domain (both languages), optionally an OAuth client for Google sign-in | analytics (6P), SEO (6Q) |
| 11 | An uptime monitor account (any provider that can call a URL every minute and alert by email or SMS), and who receives alerts and when (on-call names, phone numbers) | monitoring (decision 3) |
| 12 | Staff list with roles for invitations and UAT, and two half-days of their time | staff UAT (decision 10) |
| 13 | Main consultation channel (Zalo OA, WhatsApp Business or both) with the numbers | floating contact, contact page |
| 14 | Approval of the monthly infrastructure cost (ADR-018) | 6L |

## Decisions taken in this spec (recommended defaults, owner pre-approved "recommended solutions")

1. **Security review with evidence, not a feeling.** One PR (6A) adds `docs/SECURITY_REVIEW.md`, a checklist where every line has a pass, a fail with an issue, or "accepted" with a reason:
   - **RLS:** every table has RLS on and policies for exactly the matrix in `ARCHITECTURE.md` "Authorization"; one pgTAP file (`supabase/tests/0x_role_matrix_test.sql`) walks the matrix per role (anon, customer, each staff role at aal1 and aal2) for read and write on every table. The existing tests stay; this one makes gaps visible.
   - **Definer functions:** a pgTAP check that every `security definer` function sets `search_path = ''` and has no `execute` for `public`, `anon` or `authenticated` unless it is on an explicit allow-list in the test (search, the customer-safe functions, the role-checked staff functions).
   - **Service-role use:** `createAdminClient()` is imported only from `src/modules/**` server files; a unit test greps the source tree and fails on any other importer. Each call site is listed in the review with why it needs the service role (guest write, webhook, cron, invitation, deletion).
   - **Supabase:** Security Advisor and Performance Advisor clean on staging (or each remaining warning accepted in the review); `supabase db lint` clean in CI.
   - **Headers:** an E2E test asserts the header set on a public page, a secure page, the admin and an API route; HSTS gains `includeSubDomains; preload` only once the production domain and every subdomain serve HTTPS, then the domain is submitted to the preload list (owner).
   - **Rate limits and Turnstile:** an E2E or unit check per protected action (sign-in, sign-up, reset, lookup, inquiries, contact, newsletter, booking creation, payment start) proves the limit and its fail mode (ADR-029, ADR-037).
   - **Permissions:** an E2E per role opens every admin route and asserts allowed or 404, and calls one Server Action of each module as an under-privileged role (403 or refused).
   - **Dependencies:** `npm audit --omit=dev` with no high or critical issue unaccepted; secrets scan of the git history (gitleaks) in CI once.
2. **Payment and webhook hardening** (the Phase 4 "Before go-live" list, Stream A): source-IP allow-lists from env (`VNPAY_IPN_ALLOWED_IPS`, `BANK_WEBHOOK_ALLOWED_IPS`, comma-separated CIDRs; empty means "not enforced", required when `VERCEL_ENV=production`), checked against the first `x-forwarded-for` hop that Vercel sets. VNPay sandbox IPNs for a cancelled and a failed payment become test vectors. The Casso signature header is checked against Casso's current documentation. The env schema refuses `VNPAY_STUB` whenever `VERCEL_ENV` is `production`.
3. **Monitoring that is read.**
   - **Failed scheduled jobs:** a service-role function `cron_failures(since timestamptz)` returns failed rows of `cron.job_run_details` (job name, start, message). The existing alert jobs (`booking-seat-invariant-alert`, `email-problems-alert`) already fail on purpose when something is wrong, so a failed run is the signal. A new Vercel Cron route `/api/cron/health-checks` (every 15 minutes, `CRON_SECRET`) emails the team once per failed run (key `cron_failure:<job>:<start>`, ADR-036) and reports it to Sentry. Without `pg_cron` (local, CI) the function returns nothing.
   - **Missed scheduled jobs:** the same route alerts when a job that should run every 5 or 15 minutes has no successful run for three intervals.
   - **Uptime:** the owner's monitor calls `/api/health` every minute; two consecutive failures page the on-call person.
   - **Sentry:** alert rules for new issues, a spike rule, and an IPN or webhook failure rule (tag `payment.webhook`); release tracking with source maps from Vercel builds.
   - **Runbooks:** `README.md` "Runbooks" gains "a job failed", "the site is down", "Sentry spike", "restore from backup" and "rotate a secret".
4. **Housekeeping jobs** (Stream A):
   - **Staged media:** objects in `media-uploads/pending/` older than 24 hours are removed (ADR-023). Storage files are removed through the Storage API, not by deleting `storage.objects` rows, so this runs in `/api/cron/housekeeping` (daily) with the service-role client; it lists by prefix in pages and logs the count.
   - **Access tokens:** a `pg_cron` job deletes `booking_access_tokens` rows that expired or were used more than 30 days ago (`booking-tokens-cleanup`, daily).
   - **Webhook payloads:** `webhook_events.payload` older than 400 days is replaced by `{}`. The row (provider, key, times) stays as idempotency proof.
   - **Nothing else is deleted automatically.** `email_logs`, `audit_logs`, `consent_records`, bookings and payments follow the retention rules in the privacy policy and the deletion procedure (ADR-037), not a timer.
5. **Performance, accessibility and responsive QA** (Stream B, with Stream A for the admin):
   - **Lighthouse** (mobile, on the production-like staging deployment with real content) for home, listing, a tour page, a destination, the journal and an article, the wizard, contact, checkout and the account overview. Targets: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO 100; Core Web Vitals within `ARCHITECTURE.md` "Performance". Results are attached to the PR. A page that misses gets a fix or an issue the owner accepts.
   - **Field data:** Vercel Speed Insights on production for the two weeks of close monitoring.
   - **Manual accessibility pass:** keyboard only, then VoiceOver (iOS Safari) and NVDA (Windows Firefox), on the booking flow, the wizard, the menus, the consent banner and dialogs, and sign-in. Findings go into `docs/SECURITY_REVIEW.md`'s sibling `docs/QA_REPORT.md`.
   - **Responsive:** 360, 375, 768, 1024, 1280 and 1440 px, plus real devices (one recent iPhone, one mid-range Android), with Vietnamese and English content at their longest.
   - **Budget:** the 150 KB initial-JS budget stays enforced. Analytics (decision 7) loads only after consent and is never counted against it.
6. **Real content and SEO at launch** (Stream B for code, owner for content): content entered through the admin, never in seed files; production starts with migrations plus `settings` only (no development seed). Search Console verified for the domain, both sitemaps submitted, and Rich Results Test passing on a tour, an article, the FAQ and the home page. If an old site exists, its URLs are mapped to new ones in the admin's redirects (synced to Redis) before DNS moves, with a crawl of the old sitemap to check every URL answers 301 to a live page.
7. **Analytics and cookie consent** (Stream B; ADR-039):
   - **GA4 through `gtag.js`, not GTM.** A tag manager can inject any script, which the CSP (ADR-027) would have to allow with `unsafe-eval`; gtag.js needs only `https://www.googletagmanager.com` in `script-src` and Google Analytics hosts in `connect-src` and `img-src`. This amends `ARCHITECTURE.md` ("GA4 via GTM").
   - **Basic Consent Mode v2:** nothing loads before the visitor chooses (the banner's promise and the E2E check stay). After "analytics" is granted, the page sets the Consent Mode defaults (`analytics_storage: granted`, `ad_storage`, `ad_user_data` and `ad_personalization` denied unless "marketing" is granted), then loads gtag.js. Withdrawing consent updates the state, stops events and deletes the `_ga*` cookies.
   - **Events** from `ARCHITECTURE.md` "SEO": `view_item_list`, `view_item`, `begin_checkout`, `purchase` and `generate_lead`. `purchase` is sent once per booking code when the result page first shows a confirmed payment, deduplicated in `localStorage`, with the amount in VND. `generate_lead` is sent on inquiry success. No personal data goes into events (no names, emails or phone numbers, no booking codes in page paths sent to GA, since `page_location` is stripped of query strings).
   - **Secure pages:** the nonce CSP pages load gtag.js with the request nonce.
   - **Proof of cookie consent:** the cookie alone is not proof (Decree 13/2023 asks the controller to show consent was given). A new table `cookie_consents` holds `id` (a random UUID kept in the `consent` cookie), `choices` (analytics, marketing), `banner_version`, `locale` and `created_at`. It holds no IP, user agent or account link: it proves a choice without identifying a person. Rows are written by a rate-limited Server Action, never directly by anon, and kept for 5 years. A changed choice is a new row with the same `id`. `consent_records` stays for consents tied to an email address (terms, privacy, marketing email). To be confirmed by counsel (owner item 4).
8. **PITR and a restore rehearsal** (Stream A with the owner):
   - **Before launch:** PITR is enabled on production, plus daily backups.
   - **The rehearsal, on staging:** create data, note the time, damage it (delete a booking and its payments), restore to the noted time into a new project, point a preview deployment at it, and check `/api/health`, the booking and the audit trail. Record the steps, the elapsed time (RTO) and the data window (RPO) in `README.md` "Runbooks" → "restore from backup".
   - **Owner sign-off:** the owner signs off on the measured RTO and RPO.
   - **Storage:** Storage objects are not covered by database PITR. The runbook states that `media` is re-uploadable from the originals the owner keeps, and that `private` holds nothing yet (P1 vouchers).
9. **VNPay production sign-off** (Stream A with the owner):
   - **Sandbox:** run VNPay's own test-case list in the sandbox on staging. Record each case (success, cancelled, failed, expired, wrong amount, repeated IPN, late IPN) with the IPN log line and the booking state in `docs/QA_REPORT.md`.
   - **VNPay review:** send VNPay the results and receive their sign-off.
   - **Production:** set production credentials in Vercel production only and register the production IPN URL.
   - **First live payment:** make one real payment with a small amount on a test departure, confirm it through the IPN, then refund it manually and record the refund (Phase 4 refund flow).
   - **Bank transfer:** the same pattern with one real transfer through SePay or Casso.
10. **Staff UAT** (both streams, owner's staff):
    - **Scenarios:** written per role in `docs/UAT.md`. A sales person takes an inquiry to a quote and a paid booking; an operator manages departures and exports a passenger list; an accountant records a cash payment and a refund (with MFA); an editor publishes a tour in both languages with photos; an admin invites staff, changes settings and reads the audit log.
    - **Where:** on staging with realistic content and every service configured in test mode.
    - **Triage:** each finding is critical, major or minor. Launch needs zero open criticals; majors are fixed or explicitly accepted by the owner.
11. **Production deployment** (Stream A runs it, Stream B checks the public site):
    - **Environments:** Vercel production uses only production values; previews use staging Supabase and Upstash and never production secrets. The env schema refuses known staging hosts when `VERCEL_ENV=production`.
    - **Migrations** reach production through `supabase db push` from a protected workflow run by an admin, after a manual backup, never from a developer machine. CI's type-generation check proves the schema matches.
    - **First admin:** created by invitation (ADR-032); no seeded users in production.
    - **Supabase settings:** Auth as in the Phase 5 "Before go-live" list; Storage buckets from migrations; `pg_cron` enabled and its jobs scheduled (the migrations already schedule them when the extension exists); Vercel Cron deployed (`vercel.json`).
    - **DNS and HTTPS:** DNS points at Vercel, HTTPS is checked on every host, then HSTS preload (decision 1).
    - **Going live:** Redis redirects synced and the language hash rebuilt (one admin save is enough). A smoke test on production follows: home, a tour, a booking up to the payment page (not paid), the contact form, and admin sign-in with MFA.
    - **After launch:** two weeks of close monitoring with a named person per day. Sentry, the uptime monitor and the health-check emails are looked at daily, and a short daily note goes in `PROGRESS.md`.
12. **Launch checklist:** the acceptance list below is the checklist. The launch PR copies it into `docs/LAUNCH_CHECKLIST.md` with a date, a name and evidence (link, screenshot or log line) for each item.
13. **No new features.** Phase 6 fixes, hardens, documents and launches. Anything else goes to P1 (`FEATURES.md`).
14. **Backlog closed in this phase** (from `PROGRESS.md`; each item owned as shown):
    - Stream A:
      - failed pg_cron runs are read (decision 3);
      - expired access tokens and staged media are cleaned up (decision 4);
      - failed emails are windowed on a `failed_at` time instead of the claim time (the alert, the staff resend and the single-use emailed tokens already shipped in #39);
      - publishing a language in the journal, page and taxonomy editors removes a redirect from that path (tours already do);
      - booking functions refresh the `tours` tag;
      - the cold-start cost of the 50 ms redirect timeout is measured on staging.
    - Stream B:
      - cookie-consent proof (decision 7);
      - the privacy policy names every processor and covers `media.original_name` in audit logs (decision 7, owner item 4);
      - the build cache after a Supabase outage is checked on the first Vercel preview (known issue);
      - the Redis language hash is confirmed on staging with real Upstash (Phase 3 spec, step 22 notes).

## Work split

| Area | Stream A | Stream B |
| --- | --- | --- |
| Security review (decision 1) | RLS and definer-function tests, service-role audit, Security Advisor, permission E2E for the admin and actions, dependency and secrets scans, `docs/SECURITY_REVIEW.md` | header E2E for public pages, rate-limit checks for public forms (contact, newsletter, inquiries), CSP review of public pages with analytics |
| Payments (decision 2, 9) | allow-lists, test vectors, Casso check, `VNPAY_STUB` guard, VNPay sign-off run | the public result page's `purchase` event (decision 7) |
| Monitoring and housekeeping (decisions 3–4) | `cron_failures()`, `/api/cron/health-checks`, `/api/cron/housekeeping`, cleanup jobs, Sentry rules, runbooks | none |
| Analytics and consent (decision 7) | review of the `cookie_consents` migration and its pgTAP (database owner) | `cookie_consents` migration (pgTAP ≥ 30), Server Action, gtag loader, Consent Mode, events, CSP hosts, ADR-039, `ARCHITECTURE.md` analytics row |
| QA (decision 5) | admin and secure pages: Lighthouse, keyboard and screen reader | public pages: Lighthouse, keyboard and screen reader, responsive, real devices; `docs/QA_REPORT.md` |
| Content, legal, SEO (decision 6) | Settings for booking rules and company details | legal footer, policy pages as published content, Search Console, Rich Results, old-site redirects |
| PITR, deployment (decisions 8, 11) | rehearsal, protected migration workflow, production env checks, launch run | production smoke test of the public site, Search Console submission |
| UAT (decision 10) | admin scenarios, triage | public scenarios (booking, wizard, account), triage |

## Stream rules

- Migrations: timestamps later than main's newest when the branch merges (rename on rebase). Stream A's pgTAP files stay below 30, Stream B's at 30 and above.
- ADRs: this spec records ADR-039. Further ADRs take the next free number; the branch that merges second renumbers.
- Stream A does not edit `src/app/(public)`; Stream B does not edit `src/app/(secure)`, the admin or `src/modules/{identity,booking,payment,notification}`, except the one-line event calls agreed in the cross-stream table.

## Steps

One pull request per group, one commit per step. Items that need the owner are marked; their PRs ship the code path with its off mode and list what stays blocked.

### PR 6A — Security review (Stream A)

1. `supabase/tests/0x_role_matrix_test.sql` (the matrix per role and table), the definer-function allow-list test, the `createAdminClient()` importer test.
2. Permission E2E per role across admin routes and one action per module; header E2E on the four page types.
3. Payment hardening of decision 2 (allow-lists, `VNPAY_STUB` refusal in production, Casso check, vectors once sandbox IPNs exist [owner 8]).
4. `npm audit` and gitleaks in CI; `docs/SECURITY_REVIEW.md` with every line resolved; Security Advisor results from staging [owner 5].

### PR 6B — Monitoring and housekeeping (Stream A)

5. Migration: `cron_failures(since)`, `booking-tokens-cleanup` and the webhook payload trim as `pg_cron` jobs (scheduled only when the extension exists, like Phase 4); pgTAP.
6. `/api/cron/health-checks` and `/api/cron/housekeeping` with `CRON_SECRET`, `vercel.json` schedules, unit tests (alert once per failed run, missed-run rule, staged-object age filter, paging), E2E calls with and without the secret.
7. Sentry alert rules and release tracking [owner 7]; runbooks in `README.md`; the Stream A backlog items of decision 14.

### PR 6P — Analytics and cookie consent (Stream B)

8. ADR-039 is recorded with this spec. Migration `*_cookie_consents.sql` (table, RLS with no API-role policies, service-role insert function, 5-year retention noted), pgTAP `3x_`.
9. Consent Server Action (rate-limited, validated, writes a row per choice and keeps the `id` in the cookie); the banner and settings dialog call it.
10. gtag loader after consent, Consent Mode v2 states, cookie removal on withdrawal, the five events, CSP hosts in the public and secure policies; unit tests for the consent state machine and event payloads (no personal data); E2E: no Google request before a choice, requests after "accept analytics", none after withdrawal, `purchase` once per booking. Off without `NEXT_PUBLIC_GA_MEASUREMENT_ID` [owner 10].

### PR 6Q — QA, content and SEO (Stream B)

11. Lighthouse and manual accessibility runs on staging with real content [owners 3, 5]; fixes; `docs/QA_REPORT.md`.
12. Legal footer and policy pages with the owner's texts [owners 2, 4]; Search Console, sitemaps and Rich Results [owner 10]; old-site redirect map if any [owner 1].

### PR 6C — Restore rehearsal and deployment pipeline (Stream A)

13. Protected migration workflow (manual dispatch, admin approval, backup first); production env guards (decision 11); the restore rehearsal and its runbook [owner 5].

### PR 6L — Launch (both streams)

14. UAT (`docs/UAT.md`) with findings triaged [owner 12]; VNPay and bank-transfer sign-off [owners 8, 9].
15. Production deployment, smoke test, `docs/LAUNCH_CHECKLIST.md` completed; two weeks of close monitoring logged in `PROGRESS.md`.

## Acceptance criteria (the launch checklist)

Security
- [ ] `docs/SECURITY_REVIEW.md` complete: every line pass or accepted with a reason; role-matrix and definer-function pgTAP green
- [ ] Supabase Security Advisor clean on production (or accepted items listed)
- [ ] Webhook allow-lists configured in production; `VNPAY_STUB` refused there
- [ ] HSTS with `includeSubDomains; preload` on the production domain, preload submitted
- [ ] No high or critical dependency issue open; no secret in the git history

Payments
- [ ] VNPay sandbox test cases signed off by VNPay; one live VNPay payment and one live bank transfer confirmed by IPN or webhook and refunded or reconciled

Data and operations
- [ ] PITR on, restore rehearsed with recorded RTO and RPO
- [ ] Failed and missed scheduled jobs alert the team; the uptime monitor pages the on-call person; Sentry alert rules live
- [ ] Staged media and expired token cleanup running

Public site
- [ ] Lighthouse targets met on the listed pages (or accepted); Core Web Vitals "Good" on staging
- [ ] Keyboard and screen-reader passes done; no open serious accessibility issue
- [ ] Real content in both languages; legal footer with licence and the Ministry notification
- [ ] Terms, privacy, cancellation and payment policies published in both languages after counsel's review
- [ ] Analytics loads only after consent, events verified in GA4 DebugView; cookie choices recorded
- [ ] Search Console verified for both languages, sitemaps submitted, Rich Results Test passing

Launch
- [ ] Staff UAT signed off: zero open critical issues
- [ ] Production smoke test passed; two weeks of close monitoring with no critical bug open
- [ ] Lint, typecheck, unit, pgTAP, E2E and the JS budget green in CI on the launch commit

## Documentation updates and their owners

| Document | Change | PR |
| --- | --- | --- |
| `DECISIONS.md` | ADR-039 (analytics with gtag.js after consent, anonymous cookie-consent records) | this spec |
| `DEVELOPMENT_PLAN.md` | Phase 6 links this spec | this spec |
| `ARCHITECTURE.md` "Tech stack" (Analytics), "Security", "Monitoring" | gtag.js and Consent Mode as built; allow-lists; health checks and housekeeping | 6P, 6A, 6B |
| `DATABASE.md` | `cookie_consents`; `cron_failures()`; cleanup jobs | 6P, 6B |
| `README.md` | runbooks, protected migration workflow, production env checklist, new env variables (`NEXT_PUBLIC_GA_MEASUREMENT_ID`, allow-lists) | 6B, 6C, 6P |
| `docs/SECURITY_REVIEW.md`, `docs/QA_REPORT.md`, `docs/UAT.md`, `docs/LAUNCH_CHECKLIST.md` | new | 6A, 6Q, 6L |

## Out of scope

New features (P1 and P2 in `FEATURES.md`), MoMo and international cards, e-invoice integration, a mobile app, a CDN in front of Storage (only if bandwidth requires it, `ARCHITECTURE.md` "Scalability"), performance tracing in Sentry (known issue: needs a `beforeSendSpan` first).

## Handover prompt

```text
Read CLAUDE.md, the docs it imports and docs/specs/phase-6-hardening-launch.md. Implement the next
PR of your stream, one step per commit, following the decisions and the work split. Every check
leaves evidence (a test, a log line, a screenshot or a document line); never mark an item done
without it. Items that need the owner's accounts ship their off mode and are listed as blocked in
the PR. Run lint, tsc, unit tests, pgTAP, the production build and the JS budget before each push.
Open the PR with an acceptance table, deviations and what is blocked by missing accounts.
```
