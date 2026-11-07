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
| 4a | Counsel's review of the deletion procedure and the 10-year retention of bookings and payments (ADR-037), the 5-year retention of cookie-consent records (decision 7), and whether the Decree 13/2023 and Personal Data Protection Law impact-assessment dossiers are needed: one for processing, one for cross-border transfer (Supabase in Singapore; Vercel, Sentry, Resend and Google in the US), with their filing if so | launch (legal) |
| 5 | Vercel Pro team and project; Supabase Pro organisation with a **staging** and a **production** project in Singapore, the **PITR add-on** on production | everything in 6C and 6L |
| 6 | Resend account and DNS access to add SPF, DKIM and DMARC for the sending domain; the team address for alerts and inquiries (`settings.contact.email`) | Auth emails, transactional emails, team alerts |
| 6a | Supabase Auth production settings, set in the dashboard: "Confirm email" ON and "Secure email change" ON (Phase 5 decision 6), minimum password length 10 with leaked-password protection, the `[auth.rate_limit]` values of Phase 5 decision 2, SMTP through Resend with the four Auth templates, site URL and redirect URLs for production and previews | customer sign-up and reset, staff invitations (6L) |
| 7 | Upstash Redis database (Singapore), Cloudflare Turnstile site (production domain), Sentry organisation and project | rate limits, redirects, forms, error monitoring |
| 8 | VNPay merchant contract with sandbox and production credentials, the production IPN URL registered with VNPay, and VNPay's test-case sign-off | VNPay go-live (decision 9) |
| 9 | Receiving bank account and the choice of SePay or Casso, with its API key and the webhook registered | bank transfer go-live |
| 10 | Google: GA4 property (measurement ID), Search Console for the domain (both languages), optionally an OAuth client for Google sign-in | analytics (6P), SEO (6Q) |
| 11 | An uptime monitor account (any provider that can call a URL every minute and alert by email or SMS), and who receives alerts and when (on-call names, phone numbers) | monitoring (decision 3) |
| 12 | Staff list with roles for invitations and UAT, and two half-days of their time | staff UAT (decision 10) |
| 13 | Main consultation channel (Zalo OA, WhatsApp Business or both) with the numbers | floating contact, contact page |
| 14 | Approval of the monthly infrastructure cost (ADR-018) | 6L |

## Decisions taken in this spec (recommended defaults, owner pre-approved "recommended solutions")

1. **Security review with evidence, not a feeling.** One PR (6A) adds `docs/SECURITY_REVIEW.md`, seeded with one line for every bullet of `ARCHITECTURE.md` "Security", plus the items below. Every line has a pass, a fail with an issue, or "accepted" with a reason:
   - **RLS:** every table has RLS on and policies for exactly the matrix in `ARCHITECTURE.md` "Authorization"; one pgTAP file (`supabase/tests/0x_role_matrix_test.sql`) walks the matrix per role (anon, customer, each staff role at aal1 and aal2) for read and write on every table. The existing tests stay; this one makes gaps visible.
   - **Definer functions:** a pgTAP check that every `security definer` function sets `search_path = ''` and has no `execute` for `public`, `anon` or `authenticated` unless it is on an explicit allow-list in the test (search, the customer-safe functions, the role-checked staff functions).
   - **Service-role use:** `createAdminClient()` is imported only from `src/modules/**` server files; a unit test greps the source tree and fails on any other importer. Each call site is listed in the review with why it needs the service role (guest write, webhook, cron, invitation, deletion).
   - **Supabase:** Security Advisor and Performance Advisor clean on staging (or each remaining warning accepted in the review); `supabase db lint` clean in CI.
   - **Headers:** an E2E test asserts the header set on a public page, a secure page, the admin and an API route; HSTS gains `includeSubDomains; preload` only once the production domain and every subdomain serve HTTPS, then the domain is submitted to the preload list (owner).
   - **Rate limits and Turnstile:** an E2E or unit check per protected action (sign-in, sign-up, reset, lookup, inquiries, contact, newsletter, booking creation, payment start) proves the limit and its fail mode (ADR-029, ADR-037).
   - **Permissions:** an E2E per role opens every admin route and asserts allowed or 404, and calls one Server Action of each module as an under-privileged role (403 or refused).
   - **Dependencies:** `npm audit --omit=dev` with no high or critical issue unaccepted; secrets scan of the git history (gitleaks) in CI once.
2. **Payment and webhook hardening** (the Phase 4 "Before go-live" list, Stream A): source-IP allow-lists from env (`VNPAY_IPN_ALLOWED_IPS`, `BANK_WEBHOOK_ALLOWED_IPS`, comma-separated CIDRs; empty means "not enforced", required when `VERCEL_ENV=production`), checked against the first `x-forwarded-for` hop that Vercel sets. Where a provider publishes no addresses, the review records an accepted exception and the signature check stays the only guard. VNPay sandbox IPNs for a cancelled and a failed payment become test vectors. The Casso signature header is checked against Casso's current documentation. The env schema refuses `VNPAY_STUB` whenever `VERCEL_ENV` is `production`.
3. **Monitoring that is read.**
   - **Failed scheduled jobs:** `cron_failures(since timestamptz)` (`security definer`, `search_path = ''`, execute for the service role only) returns failed rows of `cron.job_run_details` (job name, start, message). It is guarded by `to_regclass('cron.job_run_details')`, so it returns nothing where `pg_cron` is missing. The existing alert jobs (`booking-seat-invariant-alert`, `email-problems-alert`) already fail on purpose when something is wrong, so a failed run is the signal. A new Vercel Cron route `/api/cron/health-checks` (every 15 minutes, `CRON_SECRET` checked as in Phase 5 decision 12: SHA-256 digests compared in constant time) emails the team once per failed run (key `cron_failure:<job>:<start>`, ADR-036) and reports it to Sentry. Without `pg_cron` (local, CI) the function returns nothing.
   - **Missed scheduled jobs:** the same route alerts when a job that runs every 5 or 15 minutes has no successful run for three intervals, or a daily job has none for 26 hours.
   - **Vercel Cron itself:** if Vercel Cron stops, nothing above runs. Each cron route pings a heartbeat on success (Sentry Cron Monitors, or the uptime monitor's heartbeat URL), which alerts when a ping is late.
   - **Uptime:** the owner's monitor calls `/api/health` every minute; two consecutive failures page the on-call person.
   - **Sentry:** alert rules for new issues, a spike rule, and an IPN or webhook failure rule (tag `payment.webhook`); release tracking with source maps from Vercel builds.
   - **Runbooks:** `README.md` "Runbooks" gains "a job failed", "the site is down", "a payment gateway is down", "Sentry spike", "restore from backup" and "rotate a secret".
4. **Housekeeping jobs** (Stream A):
   - **Staged media:** objects in `media-uploads/pending/` older than 24 hours are removed (ADR-023). Storage files are removed through the Storage API, not by deleting `storage.objects` rows, so this runs in `/api/cron/housekeeping` (daily) with the service-role client. Storage `list()` is not recursive, so the job lists `pending/`, then each user folder, in pages. It removes only names that match `STAGED_PATH` (`src/modules/media/media.schemas.ts`) and whose `created_at` is older than 24 hours, and logs the count.
   - **Access tokens:** a `pg_cron` job (`booking-tokens-cleanup`, daily) deletes `booking_access_tokens` rows where `least(coalesce(used_at, 'infinity'), expires_at) < now() - interval '30 days'`.
   - **Job history:** `cron.job_run_details` rows older than 30 days are deleted daily, so the table does not grow without limit.
   - **Webhook payloads:** after 400 days, `webhook_events.payload` is replaced by `{}` only for events whose payload is already copied into `payments.raw_response`: those recorded as a payment, duplicates and transfers that were later assigned. `unmatched` events and events with an `error` are never trimmed, because `assign_unmatched_transfer()` reads the amount from the payload and the "unmatched transfer" runbook depends on it. The row (provider, key, times) always stays as idempotency proof. pgTAP: an unmatched event older than 400 days can still be assigned after the job runs. The predicate, written out (`record_payment_event()` leaves `error` null for a recorded payment and sets `'duplicate_transaction'`, `'unmatched'`, `'failed'` or `'invalid_amount'`; `assign_unmatched_transfer()` turns `'unmatched'` into `'assigned'`):

     ```sql
     update public.webhook_events
        set payload = '{}'::jsonb
      where received_at < now() - interval '400 days'
        and processed_at is not null                                 -- never an event still being handled
        and (error is null or error in ('assigned', 'duplicate_transaction'))
        and payload <> '{}'::jsonb;                                  -- 'unmatched', 'failed', 'invalid_amount' and any new error stay whole
     ```
   - **Nothing else is deleted automatically.** `email_logs`, `audit_logs`, `consent_records`, bookings and payments follow the retention rules in the privacy policy and the deletion procedure (ADR-037), not a timer.
5. **Performance, accessibility and responsive QA** (Stream B, with Stream A for the admin):
   - **Lighthouse** (mobile, on the production-like staging deployment with real content) for home, listing, a tour page, a destination, the journal and an article, the wizard, contact, checkout and the account overview. Targets: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO 100; Core Web Vitals within `ARCHITECTURE.md` "Performance". Results are attached to the PR. A page that misses gets a fix or an issue the owner accepts.
   - **Field data:** Vercel Speed Insights on production for the two weeks of close monitoring.
   - **Manual accessibility pass:** keyboard only, then VoiceOver (iOS Safari) and NVDA (Windows Firefox), on the booking flow, the wizard, the menus, the consent banner and dialogs, and sign-in. Findings go into `docs/SECURITY_REVIEW.md`'s sibling `docs/QA_REPORT.md`.
   - **Responsive:** 360, 375, 768, 1024, 1280 and 1440 px, plus real devices (one recent iPhone, one mid-range Android), with Vietnamese and English content at their longest.
   - **Budget:** the 150 KB initial-JS budget stays enforced. Only Google's `gtag.js` is outside it; our own loader is imported dynamically after consent, so it is not in the initial JavaScript either.
6. **Real content and SEO at launch** (Stream B for code, owner for content): content entered through the admin, never in seed files; production starts with migrations plus `settings` only (no development seed). Search Console verified for the domain, both sitemaps submitted, and Rich Results Test passing on a tour, an article, the FAQ and the home page. If an old site exists, its URLs are mapped to new ones in the admin's redirects (synced to Redis) before DNS moves, with a crawl of the old sitemap to check every URL answers 301 to a live page.
7. **Analytics, cookie consent and newsletter withdrawal** (Stream B; ADR-039):
   - **GA4 through `gtag.js`, not GTM.** A tag manager can inject any script, which the CSP (ADR-027) would have to allow with `unsafe-eval`; gtag.js needs only `https://*.googletagmanager.com` in `script-src`, and `https://*.google-analytics.com`, `https://*.analytics.google.com` and `https://*.googletagmanager.com` in `connect-src` and `img-src`. `ARCHITECTURE.md` is amended in this spec PR.
   - **Consent Mode v2, standard sequence:**
     - Before any choice, nothing loads (the banner's promise; the E2E check stays).
     - When "analytics" is granted, the loader (imported dynamically from `src/components/analytics/`) sets `gtag('consent', 'default', …)` with all four signals denied (`analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`) and `ads_data_redaction: true`, then `gtag('consent', 'update', …)` granting `analytics_storage`, and the `ad_*` signals only if "marketing" is granted. Only then does it call `gtag('config', id, { send_page_view: false })` and load the script.
     - On withdrawal: `update` to denied, no further events, and the `_ga*` cookies deleted.
   - **No secrets in what GA receives.** Payment-link tokens and booking codes are in paths (`/thanh-toan/link/[token]`, `/en/pay/[token]`, `/thanh-toan/[code]/…`, `/tai-khoan/booking/[code]`), and gtag sends `page_location` and `page_referrer` by default. So:
     - `page_view` is sent manually. `page_location` is the site origin plus the route template from `src/i18n/pathnames.ts` (for example `/checkout/[code]/result`, via `currentRoute()`), never the real path or query string. `page_referrer` is reduced to its origin, or to the template when it is this site.
     - GA is not loaded at all on `/pay/*`, the emailed-link redeem page, booking lookup or the account area (the loader checks the route template).
     - A unit test walks every dynamic route in `pathnames` and asserts that the value sent contains no parameter. An E2E test on checkout and the result page asserts that the `dl` and `dr` parameters of the collect requests carry no booking code or token.
   - **Events** (`ARCHITECTURE.md` "SEO"): `view_item_list`, `view_item`, `begin_checkout`, `purchase` and `generate_lead`, built in `src/components/analytics/events.ts`.
     - `purchase` is sent once per booking when the result page first shows a confirmed payment (deduplicated in `localStorage`), with the amount in VND and a `transaction_id` that is a salted SHA-256 of the booking code (salt from the server, never the code itself).
     - `generate_lead` is sent on inquiry success.
     - No event carries names, emails, phone numbers, booking codes or the consent id. The result page lives under the secure root, so the `purchase` call there is the one cross-stream line Stream A accepts in `(secure)`.
   - **Secure pages** that may load GA (book, checkout and result) load gtag.js with the request nonce.
   - **Proof of cookie consent:** the cookie alone is not proof (Decree 13/2023 asks the controller to show consent was given).
     - **Table:** a new table `cookie_consents` holds `id` (a random UUID kept in the `consent` cookie, a pseudonymous identifier), `action` (`accept_all`, `essential_only`, `custom`, `withdraw`), `choices` (analytics, marketing), `banner_version` (a hash of the banner and settings texts in that language, like ADR-035), `locale` and `created_at`. It holds no IP, user agent or account link, and the id is never sent to GA, Sentry or logs.
     - **Writes:** rows are written by a rate-limited Server Action (`src/modules/consent/consent.actions.ts`) through a service-role function, never directly by anon. A changed choice is a new row with the same `id`.
     - **Fail mode:** if the write fails, the choice still applies in the browser (the cookie is set), the failure is logged without the id, and the next page view retries once.
     - **Retention:** rows older than 5 years are purged by a daily `pg_cron` job.
     - `consent_records` stays for consents tied to an email address. Retention and wording are confirmed by counsel (owner item 4a).
   - **Newsletter withdrawal** (ADR-029 assigned it to Phase 6; withdrawing consent must be as easy as giving it):
     - Every newsletter email carries an unsubscribe link with a single-use token; only its SHA-256 is stored, as for confirmation.
     - The page (`/ban-tin/huy`, `/en/newsletter/unsubscribe`) unsubscribes on a button press, never on a plain visit.
     - A service-role function sets `subscribers.unsubscribed_at` and writes the withdrawal (`granted = false`) into `consent_records` in one transaction. pgTAP covers it.
     - The campaign itself is sent from Resend's broadcast tool by the owner, from the exported list, and only after this ships. Launch rule: no campaign before the unsubscribe flow is live.
   - **Privacy policy contents** (owner item 4; the team supplies the facts):
     - every processor with its purpose and country: Supabase, Vercel, Resend, Sentry, Upstash, Cloudflare Turnstile, Google Analytics, VNPay, SePay or Casso;
     - the cookies set (essential, consent, analytics) and how to change a choice;
     - retention per table: bookings and payments 10 years; inquiries, email logs and audit logs as in ADR-037; cookie consents 5 years; `media.original_name` copied into audit logs;
     - the person's rights and the deletion procedure;
     - cross-border transfer.
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
| Analytics and consent (decision 7) | review of the `cookie_consents` and unsubscribe migrations and their pgTAP (database owner); the one `purchase` call on the result page in `(secure)` | `cookie_consents` migration (pgTAP ≥ 30), `src/modules/consent`, the analytics loader and events in `src/components/analytics/`, Consent Mode, CSP hosts, newsletter unsubscribe |
| QA (decision 5) | admin and secure pages: Lighthouse, keyboard and screen reader | public pages: Lighthouse, keyboard and screen reader, responsive, real devices; `docs/QA_REPORT.md` |
| Content, legal, SEO (decision 6) | Settings for booking rules and company details | legal footer, policy pages as published content, Search Console, Rich Results, old-site redirects |
| PITR, deployment (decisions 8, 11) | rehearsal, protected migration workflow, production env checks, launch run | production smoke test of the public site, Search Console submission |
| UAT (decision 10) | admin scenarios, triage | public scenarios (booking, wizard, account), triage |

## Stream rules

- Migrations: timestamps later than main's newest when the branch merges (rename on rebase). Stream A's pgTAP files stay below 30, Stream B's at 30 and above.
- ADRs: this spec records ADR-039. Further ADRs take the next free number; the branch that merges second renumbers.
- Stream A does not edit `src/app/(public)`; Stream B does not edit `src/app/(secure)`, the admin or `src/modules/{identity,booking,payment,notification}`, except the event calls agreed in the work split above (the `purchase` call on the result page).

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

8. ADR-039 is recorded with this spec. Migration `*_cookie_consents.sql`: the table, RLS with no API-role policies, a service-role insert function and the 5-year purge job; pgTAP `3x_`.
9. Consent Server Action in `src/modules/consent` (rate-limited, validated, writes a row per choice with its action and keeps the `id` in the cookie; fail mode as in decision 7); the banner and settings dialog call it.
10. The dynamically imported gtag loader with the Consent Mode v2 sequence, manual `page_view` with route templates, the routes without GA, cookie removal on withdrawal, the five events and the CSP hosts in the public and secure policies. Unit tests: the consent state machine, event payloads, and every dynamic route sent without its parameters. E2E: no Google request before a choice; requests after "accept analytics"; none after withdrawal; `dl` and `dr` without codes or tokens; none on `/pay/*`; `purchase` once per booking. Off without `NEXT_PUBLIC_GA_MEASUREMENT_ID` [owner 10].
10a. Newsletter unsubscribe: the migration with the service-role function and pgTAP, the page and action, and the link in newsletter emails. E2E: the link unsubscribes once on the button press, and the withdrawal is recorded.

    As shipped (PR 6P):
    - **Unsubscribe tokens in a Resend broadcast** (the #50 re-review minor): the audited subscriber export (`/admin/subscribers`, "Xuất CSV") issues a fresh single-use token per active subscriber and adds an `unsubscribe_url` column in the subscriber's language; only the SHA-256 is stored, in `newsletter_unsubscribe_tokens` (one row per export, so a link in an older campaign keeps working until it is used). The owner imports the file into one Resend audience with `unsubscribe_url` as a contact property and puts it in the broadcast's footer (README "Sending a newsletter campaign"). `List-Unsubscribe`: no code path sends newsletter content (the only newsletter email the site sends is the double opt-in confirmation, to someone not yet subscribed), and Resend broadcasts set their own `List-Unsubscribe` header handled in its audience, so no header is added in code; a person who uses it is excluded by Resend but stays active in the database until a Resend write-back exists (backlog).
    - **Cookie-consent records:** the `consent` cookie keeps the record id as a fourth part (`v1.a1.m0.<uuid>`; older values without it stay valid and get one at the next choice). The id is made in the browser (UUID v4) and validated on the server; the banner version (`banner-<locale>-<16 hex>`) is hashed on the server from the `Consent` messages. The rate limit (20 per IP per 10 minutes) fails closed, following ADR-029's rule for unauthenticated writes nobody reviews; a refused or failed record is retried once on the next page view (`localStorage` `consent-retry`, at most three). CI has no Upstash, so its E2E checks the retry path; pgTAP covers the writes.
    - **GA routes:** besides `/pay/*`, the booking lookup, the account and any page with an `access` query, GA is also off on the customer sign-in pages and the newsletter confirmation and unsubscribe pages (single-use tokens in their queries). `page_title` becomes the template on routes with a code or token (the checkout titles name the booking code) or whenever the title looks unsafe. `site_language` is sent as an event parameter, since the template drops the language prefix. The `transaction_id` is an HMAC-SHA-256 of the booking code keyed by a value derived from `BOOKING_ACCESS_SECRET`; `purchase.value` is the booking total. `Analytics` is mounted by `CookieConsent`, so neither root layout changed; the `(secure)` edits are the `purchase` prop on the result page (with its effect in `ResultStatus`) and a `begin_checkout` line on the book page.
    - **Owner setting:** Enhanced measurement off in the GA4 data stream (it would send history-change page views and clicks with real URLs).

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
- [ ] Supabase Auth settings verified on production (owner item 6a)
- [ ] Previews never use production secrets (env guard and a check of every Vercel environment)
- [ ] Branch protection on `main` requires the CI checks (ADR-020)

Payments
- [ ] VNPay sandbox test cases signed off by VNPay; one live VNPay payment and one live bank transfer confirmed by IPN or webhook and refunded or reconciled

Data and operations
- [ ] PITR on, restore rehearsed with recorded RTO and RPO
- [ ] Failed and missed scheduled jobs alert the team; the uptime monitor pages the on-call person; Sentry alert rules live
- [ ] Staged media and expired token cleanup running; trimmed webhook payloads never include unmatched or error events
- [ ] `CRON_SECRET` set and Vercel Cron running, with its heartbeat
- [ ] A test error reaches Sentry (`/api/monitoring/test-error`); `/api/health` answers on a preview and in production
- [ ] SPF, DKIM and DMARC passing for the sending domain; `settings.contact.email` set

Public site
- [ ] Lighthouse targets met on the listed pages (or accepted); Core Web Vitals "Good" on staging
- [ ] Keyboard and screen-reader passes done; no open serious accessibility issue
- [ ] Real content in both languages; legal footer with licence and the Ministry notification
- [ ] Terms, privacy, cancellation and payment policies published in both languages after counsel's review
- [ ] Analytics loads only after consent, events verified in GA4 DebugView, no code or token in what GA receives; cookie choices recorded
- [ ] Newsletter unsubscribe live before any campaign; contact and newsletter forms enabled in production
- [ ] Old-site URLs answer 301 to live pages (if an old site exists)
- [ ] Search Console verified for both languages, sitemaps submitted, Rich Results Test passing

Launch
- [ ] Counsel's review of retention, deletion and the impact-assessment question done, with any dossier filed (owner item 4a)
- [ ] Every decision 14 item closed with evidence
- [ ] Staff UAT signed off: zero open critical issues
- [ ] Production smoke test passed; two weeks of close monitoring with no critical bug open
- [ ] Lint, typecheck, unit, pgTAP, E2E and the JS budget green in CI on the launch commit

## Documentation updates and their owners

| Document | Change | PR |
| --- | --- | --- |
| `DECISIONS.md` | ADR-039 (analytics with gtag.js after consent, pseudonymous cookie-consent records) | this spec |
| `ARCHITECTURE.md` "Tech stack" (Analytics) | gtag.js after consent, `cookie_consents` | this spec |
| `DEVELOPMENT_PLAN.md` | Phase 6 links this spec | this spec |
| `ARCHITECTURE.md` "Security", "Monitoring" | allow-lists; health checks, heartbeat and housekeeping | 6A, 6B |
| `DATABASE.md` | `cookie_consents`, the unsubscribe function; `cron_failures()`, cleanup jobs | 6P, 6B |
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
