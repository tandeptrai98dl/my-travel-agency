# Security review

Phase 6 spec decision 1: every line is **pass** (with evidence), **fail** (with an issue) or **accepted** (with a reason). Stream A (PR 6A, reviewed 2026-11-07) covers `ARCHITECTURE.md` "Security" line by line, the RLS matrix, definer functions, service-role use, Supabase advisors, the secure, admin and API headers, permissions, payment webhooks, rate limits of the secure flows, dependencies and secrets. Stream B covers the public pages in its own section below. "Owner item n" refers to "What the owner must provide" in `docs/specs/phase-6-hardening-launch.md`; those lines stay open until the owner's account exists and are re-checked on staging.

Found and fixed by this review (PR 6A):

- **RLS wider than the matrix:** operators could update booking contact, owner and invoice fields through the API (the app's `bookings.edit` never allowed it). `20261115100000_role_matrix_fixes.sql` limits booking updates to sales, sales managers and admins; `50_role_matrix_test.sql` and `tests/e2e/permissions.spec.ts` (operator calling `updateContactAction`) keep it so.
- **`X-Powered-By: Next.js`** on every page: `poweredByHeader: false` in `next.config.ts`; `tests/e2e/secure-headers.spec.ts`.

## Architecture "Security", line by line (Stream A)

### Payments

| Line | Result | Evidence |
| --- | --- | --- |
| Confirm only from IPN/webhooks; the return URL never confirms | pass | `record_payment_event()` is service-role only (`51_definer_functions_test.sql`: not on the session allow-list); `vnpayReturnTarget()` only reads (`payment.service.ts`); `tests/e2e/payments.spec.ts`, `booking-flow.spec.ts` |
| VNPay HMAC-SHA512 verified, constant time; merchant code checked | pass | `providers/vnpay.test.ts` (independent vector, 97 for bad hash and another merchant) |
| VNPay empty `vnp_*` values in the signature (cancelled and failed sandbox IPNs as vectors) | accepted until owner item 8 | `it.todo` placeholders in `providers/vnpay.test.ts` with the procedure; needs the VNPay sandbox merchant |
| SePay API key (`Authorization: Apikey …`) compared in constant time | pass | `providers/bank-webhook.ts` `authorized()`; `payment.service.test.ts`; E2E `payments.spec.ts` |
| SePay's optional HMAC-SHA256 signature (`X-SePay-Timestamp`, developer.sepay.vn "Secure your webhook endpoint") | accepted | the API key is SePay's documented minimum and is checked; switching to the HMAC needs its header format from the owner's account (owner item 9); follow-up in PR 6L |
| Casso: still `secure-token`, or an `X-Casso-Signature` HMAC? | accepted until owner item 9 | Casso's current documentation (developer.casso.vn, webhook v2, read 2026-11-07) says the security key is sent in a header without naming it; confirmed on the first real webhook on staging (`it.todo` in `providers/bank-webhook.test.ts`). Only matters if the owner picks Casso |
| Amount, reference and status checked | pass | `payment.service.test.ts` (04 amount mismatch recorded and flagged, 01 unknown order, failed results), `16_booking_functions_test.sql` (under/overpaid, unmatched, late payments) |
| Idempotent via `webhook_events` | pass | `16_booking_functions_test.sql`; E2E `booking-core.spec.ts` (ten identical IPNs, one payment) |
| Prices recalculated on the server | pass | `pricing.test.ts`, `booking.service.test.ts`; `create_draft_booking()` rechecks against the departure and `reserve_and_create_payment()` refuses `price_changed` (`16_booking_functions_test.sql`) |
| Webhook source IPs restricted where published | pass (code); configured at go-live | `VNPAY_IPN_ALLOWED_IPS`, `BANK_WEBHOOK_ALLOWED_IPS` (comma-separated CIDRs, first `x-forwarded-for` hop, 403 outside): `src/lib/ip-allowlist.test.ts` (IPv4, IPv6, mapped addresses, `/0`, host bits, bad input, spoofed later hops), `src/lib/env/schema.test.ts` (required in production per configured gateway), `payment.service.test.ts` (refused before the signature, nothing recorded) |
| VNPay addresses | accepted until owner item 8 | VNPay gives its IPN addresses with the merchant contract; the variable must be set before production starts (the env schema refuses to start without it while VNPay is configured) |
| SePay addresses | pass (published) | https://developer.sepay.vn/en/dia-chi-ip, copied into `README.md` "Environment variables" with the date; re-checked before go-live |
| Casso addresses | accepted exception | Casso publishes none; production sets `BANK_WEBHOOK_ALLOWED_IPS=unrestricted` (explicit, never by leaving it empty) and the secret key is the only guard. Bad-key calls are then 10 % sampled Sentry warnings |
| `VNPAY_STUB` never in production | pass | `src/lib/env/schema.test.ts` (refused with `VERCEL_ENV=production`, also with real-looking keys and allow-lists); `vnpayStubEnabled()` also checks it at run time |
| Webhook alerts are quota-safe (revisits #54's sampling) | pass | refused sources are logged only, unless they carry valid credentials (then an error every time: the provider's addresses changed); bad credentials from a listed address are unsampled errors; without an enforced list they stay 10 % warnings. `payment.service.test.ts`; runbook "A webhook source was refused" in `README.md` |

### Auth and access

| Line | Result | Evidence |
| --- | --- | --- |
| TOTP MFA for admin and accountant | pass | `can_act_as()` needs `aal2` for both (`50_role_matrix_test.sql`: admin and accountant at aal1 read like anon); `require-role.test.ts`; E2E `admin.spec.ts` (enrolment, re-verification), `permissions.spec.ts` (accountant before MFA refused a payment action) |
| Staff accounts only by admin invitation | pass | `inviteStaffAction` needs `staff.manage` (admin at aal2): `staff.service.test.ts`, `permissions.spec.ts` (sales manager refused), `settings-staff.spec.ts`; customer sign-up only creates `customer` profiles (`handle_new_user()`, `01_access_test.sql`) |
| A trigger blocks `role` changes by non-admins | pass | `guard_profile_update()`: `01_access_test.sql` ("sales cannot raise their own role"), `11_staff_test.sql` (last admin) |
| Customers read only their own bookings | pass | no direct customer policy on booking tables (`50_role_matrix_test.sql`: customer reads none of them); `customer_bookings()`/`customer_booking()` filter on `auth.uid()` (`24_customer_reads_test.sql`) |
| Guests use single-use emailed lookup links | pass | `26_booking_lookup_deletion_test.sql` (once, at most 3 open), `booking-lookup.test.ts`, E2E `lookup-deletion.spec.ts` |
| `proxy.ts` is never the only auth check | pass | admin layout gate plus a per-page `requireAdminAccess(rolesFor(...))`, every staff action `requirePermission()`, then RLS: `permissions.spec.ts` walks every admin page per role and calls actions directly over HTTP |

### Supabase

| Line | Result | Evidence |
| --- | --- | --- |
| Secret key only in server env vars | pass | `SUPABASE_SECRET_KEY` has no `NEXT_PUBLIC_` form; the env schema refuses a secret key as the publishable key (`schema.test.ts`); CI greps client bundles for the sentinel secret ("Build and E2E"); `src/lib/supabase/admin-importers.test.ts` |
| RLS on every table | pass | `00_schema_test.sql`; `50_role_matrix_test.sql` fails for a new table until its row in the matrix is reviewed |
| `supabase db lint` in CI | pass | CI job "Database": `supabase db lint --level warning --fail-on error` |
| Security Advisor (and Performance Advisor) clean | open, owner item 5 | runs only against a hosted project; recorded here from staging before launch, each remaining warning fixed or accepted |
| `security definer` functions pin `search_path = ''` and are not executable by `public`, `anon`, `authenticated` unless intended | pass | `51_definer_functions_test.sql` with the allow-list (role helpers, `booking_cutoff_days()`, the three customer-safe functions, the role-checked staff functions); no definer function is executable by `public` |

### Application

| Line | Result | Evidence |
| --- | --- | --- |
| Zod on every input | pass | every `*.actions.ts` parses before its service except `exportSubscribersAction` (no input); route handlers with input parse it (IPN `ipnSchema`, bank webhook provider schemas); the cron, health and test-error routes take none. Unit tests per module (`*.actions.test.ts`) |
| No string-built SQL | pass | data access is `supabase-js` and `rpc()` only; dynamic SQL exists only inside definer functions with `format('%I')`; no raw SQL in `src/` |
| Tiptap rendered from JSON through a whitelist | pass | `src/lib/rich-text.test.ts`; the two `dangerouslySetInnerHTML` uses are escaped JSON-LD (`json-ld.tsx`) and the server-rendered QR SVG (`vietqr-panel.tsx`) |
| CSP per page type | pass | secure root and admin: per-request nonce with `'strict-dynamic'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'` (`tests/e2e/secure-headers.spec.ts`, `csp.spec.ts`, `src/lib/csp.test.ts`); public pages and `/auth/*`: Stream B section below |
| HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` | pass | `tests/e2e/secure-headers.spec.ts` (secure pages, admin, four API routes; exact values, no `X-Powered-By`, `no-store`) |
| HSTS `includeSubDomains; preload` | accepted until launch | as in Stream B's section: PR 6L, owner item 1 |
| Rate limits on sign-in, sign-up, booking lookup, booking creation and payment start (inquiries: Stream B) | pass | `src/lib/rate-limit.secure-flows.test.ts` (real `rateLimit()`, in-memory Upstash: the request past each limit is refused and writes nothing; booking creation, payment start and sign-in fail open with a log line, the rest fail closed on Vercel); which limit each form passes: `customer-auth.test.ts`, `booking-lookup.test.ts`, `account-deletion.test.ts` |
| Turnstile on public forms | pass | Stream B section; secure forms (sign-up, reset, resend, lookup, booking) use `checkTurnstile()`, required on Vercel (`auth-guards.ts`, `customer-auth.test.ts`, `booking-lookup.test.ts`) |
| Redirects from Redis, never the database, in `proxy.ts` | pass | `src/lib/redirect-lookup.test.ts` (source rules, re-checked targets, 301/302 only, timeout failing open) |
| Uploads checked for real type, size and pixels, re-encoded; no SVG | pass | `media.sniff.test.ts`, `media.service.test.ts` (real `sharp` images: SVG renamed `.png`, appended script, 56 MP), E2E `media.spec.ts` |

### Personal data and compliance

| Line | Result | Evidence |
| --- | --- | --- |
| Privacy policy | open, owner item 4 | the forms that collect personal data stay off until a privacy page is published in their language (ADR-035); the text comes from counsel (PR 6Q) |
| Consent before collection, proof in `consent_records` | pass | `19_booking_consent_test.sql`, `30_newsletter_test.sql`, `31_contact_inquiry_test.sql`, `33_tailor_made_inquiry_test.sql` (versions of the published texts); cookie choices: Stream B section |
| Export and deletion on request | pass (code); procedure needs counsel (owner item 4a) | `26_booking_lookup_deletion_test.sql`, `27_operations_test.sql`, E2E `lookup-deletion.spec.ts`, `customers.spec.ts` |
| E-commerce notification to the Ministry of Industry and Trade | open, owner item 2 | launch is not legal without it (launch checklist) |
| Company details and tour operator licence in the footer | open, owner item 2 | the footer renders them from `settings.company` when set (Stream B, PR 6Q) |
| No passport numbers | pass | no such column (`travellers` has name, birth date, gender, nationality, dietary notes); `save_customer_travellers()` keeps only known keys (`24_customer_reads_test.sql`) |
| Audit log for bookings, payments and customer data | pass | `02_audit_test.sql` (catalog, content, settings, profiles), `18_booking_admin_test.sql` (manual payments, refunds, cancellations), `27_operations_test.sql` (passenger and customer exports) |
| Daily backups + PITR from launch | open, owner item 5 | PR 6C (restore rehearsal) |
| SPF, DKIM, DMARC on the sending domain | open, owner item 6 | Resend account and DNS |

## Decision 1 checks (Stream A)

### RLS matrix

`supabase/tests/50_role_matrix_test.sql` probes every table in `public` (39 at this review) as anon, a customer and each staff role at aal1 and aal2 (14 states): rows readable (none, some, all), inserting a copy of a row, a no-op update of the first updatable column, and deleting, each in a rolled-back subtransaction. It fails on a new table, a table without fixture rows, or any cell that differs from the reviewed matrix. Mutation checks: widening the booking update policy again, or giving editors `audit_logs`, fails the matching table.

| Result | Item | Reason |
| --- | --- | --- |
| fixed | operators updating booking contact, owner and invoice fields | see the top of this document |
| accepted | every staff role reads every `settings` row (also `bank_account` and `booking_rules`); only admin writes | the receiving account is shown to every customer at checkout (VietQR) and the booking rules are numbers; no secrets live in `settings`, and keeping them readable lets staff pages show the rules |
| accepted | `media`, `cancellation_policies` and `post_categories` rows are readable by anon | `media` is the public image bucket's metadata (alt texts, sizes; `original_name` is covered by the privacy policy, PR 6Q); policies are shown on tour pages and at checkout; categories carry no data of their own |
| accepted | admin and accountant without MFA have no staff rights at all, not even reading | intended (ADR-009): `can_act_as()` treats them as signed-in users with no role, and the admin sends them to `/admin/mfa` |
| accepted | the join tables (`tour_destinations`, `tour_travel_styles`) show `U:no` for editors | they have only key columns; editors insert and delete links (`set_tour_links()`), which the matrix shows |
| pass | every other cell | matches `ARCHITECTURE.md` "Authorization" and `DATABASE.md` "RLS policy summary" |

Storage policies (`media`, `media-uploads`, `private`) are covered by `01_access_test.sql` and `00_schema_test.sql`, not by the matrix.

### Definer functions

`supabase/tests/51_definer_functions_test.sql`: 91 `security definer` functions in `public`, every one with `search_path = ''`; none executable by `public`; `anon` executes only the six role helpers and `booking_cutoff_days()`; `authenticated` executes only the allow-list (role helpers, the three customer-safe functions, 23 role-checked staff functions and the `is_staff_or_trusted()` gate, each with its reason in the test). Stale allow-list entries fail too. Result: **pass**.

### Service-role use

`src/lib/supabase/admin-importers.test.ts` fails on any importer of `@/lib/supabase/admin` outside server files (`server-only`) under `src/modules/**`, on a client file and on a re-export. Result: **pass**. Each call site and why it needs the service role:

| Module file | Call sites | Why the service role |
| --- | --- | --- |
| `account/account-deletion.repository.ts` | request, state and blockers of a deletion, `anonymise_customer()`, ban, revoke sessions, soft delete | deletion (Auth Admin API and service-role functions), after the password check or `requirePermission("customers.delete_data")` |
| `account/account.repository.ts` | `setMarketingConsent` | the consent row with the published version, through a service-role function after `getUser()` |
| `account/customers-admin.repository.ts` | `dataExport`, `writeAuditRow` | personal-data export (`customer_data_export()`, service role only) and its audit row first, after `requirePermission("customers.delete_data")` |
| `booking/booking.repository.ts` | drafts, prices, `reserve_and_create_payment()`, `cancel_booking()`, cut-off days | guest writes: the book-now flow after Zod, Turnstile and rate limits; seats and money only in service-role functions (ADR-012) |
| `booking/checkout.repository.ts` | checkout by code, status poll, payment links, emailed links | guest reads after the booking access cookie, a payment-link token or an emailed token is checked (ADR-033, ADR-038) |
| `booking/booking-emails.repository.ts` | email data, access tokens for emailed links, resend log | transactional email after the commit (no session in `after()`); the staff resend after `requirePermission("bookings.edit")` |
| `booking/booking-lookup.repository.ts` | `issueBookingLookup` | guest lookup after Turnstile and fail-closed limits |
| `consent/consent.repository.ts` | `insertConsent` | cookie-consent records (Stream B, ADR-039) after Zod and the rate limit |
| `content/public/newsletter.repository.ts` | request, confirm, unsubscribe | guest newsletter writes after Zod, Turnstile and limits (ADR-029) |
| `content/subscribers.repository.ts` | `writeAuditRow`, `issueUnsubscribeTokens` | the audited subscriber export after `requirePermission("newsletter.manage")` |
| `identity/customer-auth.service.ts` | `attach_customer_bookings()`, `record_signup_consent()` | after `getUser()` and the autoconfirm guard (ADR-037); never callable by a session |
| `identity/staff.repository.ts` | Auth user lookup, invite, invited profile, rollback, audit row | staff invitations through the Auth Admin API after `requirePermission("staff.manage")` (ADR-032) |
| `inquiry/contact.repository.ts`, `inquiry/tailor-made.repository.ts` | inquiry creation | guest inquiries after Zod, Turnstile and limits |
| `inquiry/inquiry-emails.repository.ts` | inquiry and destination names for emails | emails after the commit, no session |
| `media/media.repository.ts` | signed upload, staged download and removal, publish to `media`, cleanup | Storage staging and publishing (ADR-023) after `requirePermission("media.manage")`; the staged-upload cleanup after the `CRON_SECRET` check |
| `notification/email.repository.ts` | email log claim and update | exactly-once email keys (ADR-036), no session |
| `operations/operations.repository.ts`, `operations/monitoring.repository.ts` | reminders, minimum-traveller checks, `cron_failures()`, lapsed holds | Vercel Cron jobs after the `CRON_SECRET` check |
| `payment/payment.repository.ts` | `record_payment_event()`, payment by reference, bank account | IPN and bank webhook after the source allow-list and the signature or key |

### Headers, permissions, rate limits

| Check | Result | Evidence |
| --- | --- | --- |
| Header set on a secure page, the admin and an API route (public pages: Stream B) | pass | `tests/e2e/secure-headers.spec.ts` |
| Every admin route per role is allowed or a 404 | pass | `tests/e2e/permissions.spec.ts`: 42 admin pages (checked against the route folders) for a customer, sales, sales manager, operator, editor, and accountant and admin at aal2 on fresh accounts |
| One Server Action of each staff module refused for an under-privileged role | pass | same spec: account, booking (three), catalog (three), content (two), identity, inquiry (two), media, operations, payment (also for an accountant before MFA), settings, each called directly with the build's action id; a positive control (sales, invalid input) proves the call reaches the action |
| Rate limits and fail modes of the secure flows | pass | see "Application" above |

### Dependencies and secrets

| Check | Result | Evidence |
| --- | --- | --- |
| `npm audit --omit=dev`: no high or critical issue unaccepted | pass | CI job "Security scans" (`scripts/check-audit.mjs`, acceptances with reason and expiry in `scripts/audit-accepted.json`, empty); 2026-11-07: 0 critical, 0 high, 0 moderate, 3 low |
| Low: `deepmerge` prototype poisoning (GHSA-gcqx-w48m-w2h4) through `html-to-text` in `@react-email/render` | accepted | low severity; it merges only our own fixed formatter options while rendering our own email HTML to text, never request data. Revisit when `@react-email/render` updates `html-to-text` |
| Secrets in the git history (gitleaks) | pass | CI job "Security scans" scans every commit with gitleaks 8.28.0 (pinned, checksum-verified, redacted output). First run (2026-11-07, 191 commits): 8 `generic-api-key` findings, all test fixtures, each checked in its commit: a made-up payment-link token in `analytics.test.ts` (the GA scrubber must drop it), HMAC keys spelled `test-secret…` in `booking-emails.test.ts` and `booking-access.test.ts`, a UUID idempotency key in `checkout-schemas.test.ts` and `booking.service.test.ts`, and the placeholder `sb_publishable_123` in `schema.test.ts`. They are ignored by exact fingerprint in `.gitleaksignore` (commit, file, rule, line), so any new finding fails the job. No real key, token or password was ever committed |

## Public pages (Stream B)

Scope: the public website (`src/app/(public)`), the staff sign-in pages (`/auth/*`), the public forms and the analytics of ADR-039. Reviewed on 2026-11-07 against `ARCHITECTURE.md` "Security", ADR-027, ADR-029 and ADR-039.

### Headers

| Check | Result | Evidence |
| --- | --- | --- |
| Every public page type and `/auth/*` send exactly one CSP, nonce-free, with no `'unsafe-eval'` or `'strict-dynamic'` | pass | `tests/e2e/public-headers.spec.ts` (home, listing, detail, search, destinations, travel styles, journal, article, topic, static pages, policies, reviews, contact, wizard, newsletter pages, a 404 and a 308; four `/auth/*` pages) |
| `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, frames only from Turnstile | pass | same spec; `src/lib/csp.test.ts` |
| HSTS at least one year, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` with camera, microphone, geolocation, payment, USB and Topics off | pass | same spec; `src/lib/security-headers.ts` |
| HSTS `includeSubDomains; preload` | accepted until launch | needs the production domain with every subdomain on HTTPS (decision 1; owner). Added in PR 6L, then submitted to the preload list |
| `script-src 'unsafe-inline'` on public pages | accepted | ADR-027: public pages are prerendered, so Next.js's inline bootstrap scripts cannot carry a nonce, and hashes cannot cover streamed scripts (spike in PR H). Mitigations: no inline event handlers or user HTML (rich text goes through the Tiptap whitelist), `object-src 'none'`, `base-uri 'self'`, scripts only from `'self'`, Turnstile and (with a measurement ID) gtag.js's host |
| `style-src 'unsafe-inline'` | accepted | Next.js and Radix inline styles; styles cannot run script |

### CSP with analytics (ADR-039)

| Check | Result | Evidence |
| --- | --- | --- |
| Without `NEXT_PUBLIC_GA_MEASUREMENT_ID` no Google host is allowed anywhere | pass | `src/lib/csp.test.ts` "are absent without a measurement ID" |
| With it, public pages add only `https://*.googletagmanager.com` to `script-src` and the three Google hosts to `connect-src` and `img-src`; no frames, no eval (no tag manager) | pass | `src/lib/csp.test.ts`; `tests/e2e/public-headers.spec.ts` checks `script-src` is exactly `'self' 'unsafe-inline'`, Turnstile and that host |
| Wildcard Google hosts (`*.google-analytics.com`, `*.analytics.google.com`, `*.googletagmanager.com`) | accepted | Google's documented CSP for GA4: collection goes to regional hosts (`region1.google-analytics.com`, …) that cannot be listed in advance. They are Google-owned zones; nothing else is allowed through them |
| Secure root: Google's hosts only where GA may load (book, checkout, its payment and result pages), never on the payment link, booking lookup, customer sign-in or the account (#55 review m4) | pass (fixed in this PR) | `isAnalyticsSecurePath()` in `src/lib/csp.ts`, used by `src/proxy.ts`; `src/lib/csp.test.ts` checks it agrees with the loader's `NO_ANALYTICS_ROUTES` for every secure route in both languages, and that `/thanh-toan/link/…` (same prefix as checkout) has none; `tests/e2e/analytics-csp.spec.ts` checks the served policies |
| A document opened on a route without GA never loads gtag.js, also after a client-side navigation into checkout (its policy would block Google anyway) | pass (new in this PR) | `src/components/analytics/gtag.ts` reads the document's landing URL (Navigation Timing); `src/components/analytics/gtag.sync.test.ts` |
| Trade-off of that rule: a payment made after the payment link's button or the account's "pay the balance" link, in the same document, sends no `purchase` | accepted | measurement only, in favour of never allowing Google on token or account pages. A checkout opened by a full page load (the emailed link, the booking flow, a reload) is measured |
| gtag.js loads with the request nonce on secure pages; `'strict-dynamic'` is kept | pass | `loadScript()` in `gtag.ts`; E2E `tests/e2e/analytics.spec.ts` (no CSP violation fixture failures on checkout and result) |
| Nothing GA receives carries a code, token, address or the consent id | pass | decision 7 tests from PR 6P (`analytics.test.ts`, `analytics.spec.ts`), unchanged |
| Turnstile (`https://challenges.cloudflare.com`) in `script-src`, `connect-src` and `frame-src` | accepted | ADR-029; its script loads only on the first interaction with a form |

### Rate limits and fail modes of the public forms

Every limit is a fixed window in Upstash (`src/lib/rate-limit.ts`, hashed keys). Proof: `src/lib/rate-limit.public-forms.test.ts` runs each form through its real Server Action, service and `rateLimit()` against an in-memory Upstash that can also fail or be missing.

| Form | Limits | Over the limit | Fail mode (ADR-029) | Result |
| --- | --- | --- | --- | --- |
| Contact (`sendContactMessage`) | 5 per IP / 10 min (before Turnstile), 3 per address / hour (after Turnstile) | refused, nothing written, no email | closed: refused, nothing written, Turnstile not asked; without Upstash the form is shown disabled | pass |
| Newsletter (`subscribeToNewsletter`) | 5 per IP / 10 min, 3 per address / day (both before Turnstile) | refused, no token stored, no email | closed, as above | pass |
| Tailor-made wizard (`sendInquiry`, `tailor_made`) | 5 per IP / 10 min, 3 per address / day | refused, nothing written | closed, as above | pass |
| Private-tour inquiry (`sendInquiry`, `tour_inquiry`) | as the wizard | refused, nothing written | closed, as above | pass |
| Cookie-consent record (`recordConsentChoice`) | 20 per IP / 10 min | refused, no row | closed: no row, logged at error level without the id; the choice already applies in the browser (cookie first) and the record is retried once on the next page view | pass; E2E `tests/e2e/public-rate-limits.spec.ts` (CI has no Upstash: the choice applies, gtag.js loads, no `cookie_consents` row) |

Requests without a usable IP share one `unknown` bucket per form (never the case behind Vercel). Booking creation and payment start fail open by design (ADR-033) and are reviewed by Stream A with the secure pages.

### Follow-ups

- None blocking. The HSTS preload line closes in PR 6L.
