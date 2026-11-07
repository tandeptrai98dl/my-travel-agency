# TASK-P5: Accounts, inquiries and operations

Phase 5 of `DEVELOPMENT_PLAN.md`. Customers get localized sign-in, an account area with their bookings and a guest booking lookup. Sales work a full inquiry inbox that ends in a quote. Operations get balance reminders, minimum-traveller alerts, role dashboards and a passenger list. The Phase 0 limit on customer reads of bookings and payments is closed. Stream B adds the tailor-made wizard and the private-tour inquiry form.

Two streams (ADR-025). The cross-stream table below fixes who owns what.

## Inputs

- `DEVELOPMENT_PLAN.md` Phase 5; `FEATURES.md` "Customer account", "Private and tailor-made trips", admin "Inquiries", "Dashboard", "Customers", "Booking and payment" (balance reminders, guest lookup).
- `ARCHITECTURE.md`: "Routes" (customer auth, account, booking lookup), "Data flow" (guest writes), "Authorization" (matrix), "Security" (auth and access, rate limits, Turnstile, personal data), "Monitoring".
- `DATABASE.md`: `profiles`, `inquiries`, `internal_notes`, `bookings`, `travellers`, `payments`, `consent_records`, `email_logs`; "Known Phase 0 limits" (customer reads of internal booking and payment columns).
- ADR-005 (guest booking, optional accounts), ADR-009 (roles, MFA), ADR-016 (reminders, never auto-cancel; no passport numbers), ADR-027 (nonce CSP on account and auth pages), ADR-029 (rate-limit fail modes, Turnstile), ADR-032 (staff invitations), ADR-033 (checkout access), ADR-035 (consent versions), ADR-036 (transactional email, exactly-once keys).
- `docs/specs/phase-4-booking-payments.md` decision 7 (access cookie), 14 (emails); the 4D quote and payment-link flow.
- `PROGRESS.md` backlog (starter `/auth` forms call Supabase from the browser; customer reads of internal columns; consent proof).

## Owner accounts and modes

Every integration has an off mode; nothing fails open in a way that exposes data or sends unbounded email.

| Service | Without it | Blocked until the owner provides |
| --- | --- | --- |
| SMTP for Supabase Auth (Resend) | Locally and in CI, Auth emails go to Mailpit. On a hosted project without SMTP, Supabase's built-in sender is rate-limited to a few emails per hour: sign-up and password reset work only for testing. | Resend account, sending domain (SPF, DKIM, DMARC), SMTP settings and the email templates in the Supabase dashboard. |
| Google OAuth | The Google button is not rendered and `/auth/callback` refuses a `google` flow. | Google Cloud OAuth client (ID and secret) set in Supabase; `AUTH_GOOGLE_ENABLED=true`. |
| Vercel Cron | `/api/cron/*` works when called with the secret (CI and local call it directly); nothing runs on a schedule. | Vercel Pro project with `vercel.json` crons deployed and `CRON_SECRET` set (ADR-018). |
| Resend (transactional) | Emails are `skipped` rows in `email_logs` (ADR-036). | Same account as above. |
| Turnstile, Upstash | As in Phase 4: Turnstile skipped outside production, required there; rate limits per decision 2. | Keys (already needed for the contact form and booking). |

## Decisions taken in this spec (recommended defaults, owner pre-approved "recommended solutions")

1. **One sign-in for customers, the starter pages for staff.**
   - Customers use the localized pages `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau` (`/en/login`, `/en/register`, `/en/forgot-password`, `/en/reset-password`) under `src/app/(secure)/[locale]/(auth)/`, with the secure root's nonce CSP (ADR-027). Every form posts to a Server Action (Zod, rate limit, Turnstile where decision 2 says) that calls Supabase Auth on the server; no page calls Supabase from the browser (closes the known issue about the starter forms).
   - Staff keep `/auth/login`, `/auth/forgot-password` and `/auth/update-password` (Vietnamese, the admin language), rebuilt on the same Server Actions. `/auth/sign-up` and `/auth/sign-up-success` are removed (staff are invited, ADR-032) and redirect to `/dang-ky`.
   - A staff member who signs in on a customer page lands on `/admin`; a customer who signs in on `/auth/login` lands on `/tai-khoan`. `next` parameters pass through `safeRedirectPath()`.
   - Sign-up asks for name, email, password (at least 10 characters, checked against Supabase's leaked-password setting where available), language from the page, and the privacy policy (required, recorded in `consent_records` with the published version, ADR-035) and marketing (optional, unticked). Email confirmation stays on (`enable_confirmations = true`).
   - Answers never reveal whether an address has an account: sign-up, password reset and booking lookup always show the same "check your email" message.
2. **Rate limits and Turnstile** (`src/lib/rate-limit.ts`, ADR-029 fail modes):

   | Action | Limit | Fail mode | Turnstile |
   | --- | --- | --- | --- |
   | Sign-in | 10 per IP and 5 per email per 10 min | open (logged): no email is sent and Supabase Auth has its own limits | no (Supabase's limits; reconsider if abused) |
   | Sign-up | 5 per IP per hour, 3 per email per day | closed (sends email) | yes |
   | Password reset request | 5 per IP and 3 per email per hour | closed | yes |
   | Booking lookup | 5 per IP and 3 per code per 10 min | closed | yes |
   | Inquiries (wizard, tour form) | as the contact form: 5 per IP per 10 min, 3 per email per day | closed | yes (Stream B) |
   | Change password, deletion request | 5 per user per hour | closed | no (signed in; current password required) |

3. **Google sign-in** only when configured: `AUTH_GOOGLE_ENABLED=true` (server env, validated) and the provider set in Supabase. `/auth/callback` exchanges the PKCE code on the server, refuses missing or failed codes with the auth error page, applies `safeRedirectPath()` to `next`, and runs decision 6. Google accounts are always customers (role changes stay admin-only).
4. **Account area** (`/tai-khoan`, `/en/account`), in `(secure)/[locale]/account/`, fully dynamic, signed-in customers only (others go to sign-in with `next`):
   - Overview: upcoming and past bookings, balance due, profile summary.
   - Bookings list and booking detail (`/tai-khoan/booking/[code]`): price lines, payments (amount, method, date, status), balance with a "pay the balance" link into the checkout (the owner's session already opens it, decision 7 of Phase 4), the cancellation policy snapshot, travellers.
   - Travellers: add and edit name, date of birth, nationality and dietary notes until the departure date; never passport numbers (ADR-016); at most adults + children + infants rows; one lead traveller.
   - Profile: name, phone, country, language, marketing consent (a change writes a `consent_records` row). Email changes go through Supabase's confirmation flow (both addresses confirm).
   - Change password: current password re-checked first, then `updateUser`; other sessions signed out (`signOut({ scope: "others" })`).
   - Data deletion request (decision 8).
5. **Customer-safe reads close the Phase 0 limit.** Customers read their data only through `security definer` functions (`search_path = ''`, execute for `authenticated` only) that filter on `auth.uid()` and return a fixed set of columns:
   - `customer_bookings()`: code, status, payment state, tour title and code from the snapshot, dates, party, total, amount paid, balance due date, created at.
   - `customer_booking(code)`: the above plus price lines, travellers, payments (amount, kind, provider, status, paid at; no `raw_response`, `note`, `recorded_by`, `provider_txn_id`), the cancellation-policy summary and whether travellers can still be edited.
   - `save_customer_travellers(code, travellers jsonb)`: replaces the booking's travellers in one transaction under the rules of decision 4, writes a `booking_events` row (`travellers_updated`, actor the customer).
   - Then the direct customer policies are dropped: `bookings: customer read own`, `booking_items: customer read own`, `payments: customer read own`, and the three `travellers: customer …` policies. Internal columns (`needs_attention`, `attention_reason`, `assigned_to`, `idempotency_key`, `utm`, payment `raw_response`, `note`, `recorded_by`) are no longer reachable by customers. pgTAP proves a customer gets zero rows from the tables and only their own rows from the functions, and that another customer's code returns nothing.
6. **Earlier bookings attach after verification.** `attach_customer_bookings()` (`security definer`, authenticated) sets `customer_id = auth.uid()` on bookings whose `lower(contact_email)` equals the user's email **only when `auth.users.email_confirmed_at` is set**, and only where `customer_id` is null. It writes a `booking_events` row (`attached_to_account`) per booking and returns the count. Called after every successful sign-in, email confirmation and OAuth callback (idempotent). A Google address counts as verified by Google. An email change re-runs it after the new address is confirmed; bookings already attached to another account never move.
7. **Guest booking lookup** (`/tra-cuu-booking`, `/en/booking-lookup`):
   - Form: booking code and email, Turnstile, decision 2's limits. The answer is always "if the details match, we have emailed a link", whatever matched.
   - On a match, a single-use token (32 random bytes; only its SHA-256 stored) valid for `settings.booking_rules.booking_lookup_link_minutes` (default 30) is emailed to the booking's contact address (template `booking_lookup`, exactly-once key per token, ADR-036). New table `booking_lookup_tokens (id, booking_id, token_hash unique, expires_at, used_at, created_at)`, RLS on, no API-role policy; issue and redeem only through service-role functions (`issue_booking_lookup`, `redeem_booking_lookup`).
   - The link page shows a button; the click redeems the token once and sets the booking's access cookie (Phase 4 decision 7), then opens the checkout summary. Scanners that GET the page use nothing.
   - Stream A sets nothing in the public shell; Stream B flips `features.bookingLookup` to show the footer link once this PR is merged.
8. **Data deletion** (Decree 13/2023/ND-CP; verify with legal counsel before launch):
   - The customer asks from the account area, re-entering their password. If they have no booking with a departure ahead and no open money (`pending_payment`, or a confirmed booking with a balance or an open refund question), the deletion runs at once; otherwise the request is recorded (`profiles.deletion_requested_at`), the customer is told why, and it appears on the admin customer page.
   - The deletion (`anonymise_customer(profile_id)`, service role; also callable by an MFA-verified admin through a role-checked wrapper with a note): profile `full_name`, `phone`, `country`, `avatar_url` set to null, `email` to `deleted+<id>@invalid.local`, `marketing_consent` false, `deleted_at` now; the Auth user's email is replaced the same way, its password randomised, its identities removed and the user banned (Auth Admin API), so the account can never sign in again and the profile row stays for foreign keys. Bookings are unlinked (`customer_id` null) but keep their contact details and snapshots, which accounting and tour-operator rules require to be retained; consent records stay as proof. A `marketing` withdrawal row is written to `consent_records`, and `audit_logs` records `customers.anonymise` with the actor (no personal data).
   - Data export on request (FEATURES "Customers"): the admin customer page downloads a JSON of the profile, bookings, travellers, consents and inquiries for that address, audit-logged first (like the subscriber export).
9. **Inquiry inbox** (`/admin/inquiries`, Stream A):
   - List filtered by status, owner (mine, unassigned, everyone for managers) and source, sorted by age; time to first response shown per row and as a median on the dashboard.
   - Detail: the inquiry, linked tour, consent version, notes (`internal_notes`), status changes, linked booking.
   - Assignment: sales take unassigned inquiries; `sales_manager` and `admin` assign anyone (`assign_inquiry()`, role-checked definer, audit row). The RLS of Phase 0 already limits sales to assigned and unassigned rows.
   - First response: `first_responded_at` is set once, by the first of: a status change away from `new`, a note marked "contacted the customer", or a quote. Set in `update_inquiry_status()` / `create_quote()` (amended), never by the client.
   - Quote from inquiry: a button opens `/admin/bookings/new?inquiry=<code>` with the contact, party and tour prefilled (the 4D form already accepts the inquiry code and marks the inquiry `quoted`).
   - Emails: Stream A provides `sendInquiryEmails(inquiryId)` in `src/modules/inquiry` (customer confirmation with the inquiry code in the inquiry's language; team alert to `settings.contact.email` within a minute), keyed `inquiry_received:<id>` and `inquiry_alert:<id>`. Stream B's actions call it after their write commits.
10. **Balance reminders and overdue flags** (`/api/cron/balance-reminders`, daily at 01:43 UTC, 08:43 in Vietnam):
    - Confirmed bookings with a balance whose due date is exactly N days away for each N in `settings.booking_rules.balance_reminder_days_before_due` (default 7 and 2) get the 4E balance reminder, keyed `balance_reminder:<booking id>:<N>d`, so a rerun the same day sends nothing.
    - Bookings past their due date with a balance get `needs_attention = balance_overdue` once (ADR-016: remind and flag, never cancel) and a team alert.
    - Logs count only (no addresses).
11. **Minimum-traveller alerts** (`/api/cron/departure-checks`, daily): for departures within 21 days whose confirmed adults + children are below the tour's `min_pax_to_operate`, a team alert (`min_pax:<departure id>:<days bucket>` at 21, 14 and 7 days) and a dashboard count. Operators decide; nothing is cancelled automatically.
12. **Cron secret.** `vercel.json` declares the schedules. Vercel sends `Authorization: Bearer <CRON_SECRET>`; routes compare it in constant time and answer 401 otherwise, 503 when `CRON_SECRET` is not set (validated: at least 32 characters when present, required when `VERCEL_ENV === "production"`). Routes are `GET`, idempotent, never cached and run the work through the service role inside `src/modules/*`. CI calls them with a CI-only secret.
13. **Dashboard per role** (`/admin`), from one read per role through role-checked definer functions:
    - Sales: my open inquiries, unassigned inquiries, my quotes awaiting payment, median time to first response (30 days).
    - Operator: departures in the next 14 days with seats and travellers filled, departures below minimum, bookings missing traveller details.
    - Accountant: revenue collected this month (payments `succeeded` less refunds), payments about to expire, unmatched transfers, the money part of the attention queue.
    - Editor: drafts and items missing translations or alt text.
    - Admin: all of the above plus deletion requests.
14. **Passenger list export** (operator, admin): per departure, a CSV of confirmed and completed bookings' travellers (name, date of birth, nationality, dietary notes, booking code, lead flag; contact phone of the lead only), no passport numbers, formulas neutralised as in the subscriber export, refused unless its `audit_logs` row (`departures.passenger_export`, actor, departure, row count) is written first.
15. **Auth emails in both languages.** Supabase templates (`supabase/templates/confirmation.html`, `recovery.html`, `email_change.html`, plus the existing `invite.html`) branch on `{{ .Data.locale }}` from user metadata and link to `/auth/confirm?token_hash=…&type=…&next=…`, which verifies on the server and sends the customer to their localized page. Hosted projects need the same templates set in the dashboard (owner).
16. **Customers admin** (`/admin/customers`, FEATURES "Customers"): list with search by name or email, detail with bookings, inquiries, notes (sales roles), consent history, deletion request state; export and anonymise for an MFA-verified admin (decision 8).

## Cross-stream items

| What | Stream A (owner) | Stream B | When |
| --- | --- | --- | --- |
| Customer auth pages, `/auth/callback`, starter `/auth` rebuild | `(secure)/[locale]/(auth)/`, `src/modules/identity`, `src/app/auth/*` | links "Sign in" / "My account" in the header only after PR 5A merges (`features.accounts`, flipped by Stream B) | PR 5A |
| Account area and customer-safe functions | `(secure)/[locale]/account/`, migration, pgTAP < 30 | none | PR 5A |
| Guest booking lookup | page under `(secure)/[locale]/(booking)/booking-lookup`, functions, template | flips `features.bookingLookup` (footer link) after PR 5B merges | PR 5B |
| Inquiry write path | none | `create_tailor_made_inquiry(...)` (service role, like `create_contact_inquiry()`), migration in its range, pgTAP ≥ 30; the wizard and the tour inquiry form | PR 5W (Stream B) |
| Inquiry emails | `sendInquiryEmails(inquiryId)` and the two templates in `src/modules/inquiry` + `emails/` | calls it after the write commits; never builds email itself | PR 5C before 5W merges |
| Inquiry inbox, quote from inquiry | `/admin/inquiries`, `assign_inquiry()`, `update_inquiry_status()`, first-response rule | the `source` values it writes (`tailor_made`, `tour_inquiry`) | PR 5C |
| Inquiry fields | adds nothing to `inquiries` without agreement | maps wizard steps to existing columns (`destination_ids`, `destinations_other`, `travel_style_id`, `travel_month`, `flexible_dates`, `duration_days`, `adults`, `children`, `budget_per_person`, `company_name`, `preferred_contact`, `message`, `utm`) | PR 5W |
| `features` flags (`src/lib/features.ts`) | none | owns the file; flips `inquiry`, `bookingLookup`, `accounts` | after each Stream A PR |
| Strings | `messages/{vi,en}/account.json`, `auth.json`, `admin-inquiries.json`, `emails.json` | `public-inquiry.json` | — |
| Cron routes and `vercel.json` | `/api/cron/*`, `vercel.json` | none | PR 5D |

## Stream rules

- Migrations: timestamps later than main's newest when the branch merges (rename on rebase). Stream A's pgTAP files stay below 30, Stream B's at 30 and above.
- ADRs from ADR-037 (this spec records ADR-037). If two branches clash, the one that merges second renumbers.
- Stream A does not edit `src/app/(public)`; Stream B does not edit `src/app/(secure)`, the admin or `src/modules/{identity,booking,payment,notification}`.

## Steps

One pull request per group, one commit per step. Every Server Action and Route Handler: Zod, rate limit, `requireRole()` for staff, then a service. Every function and policy gets pgTAP; every service gets unit tests; sign-in, deletion and lookup get E2E.

### PR 5A — Customer auth, account area, customer-safe reads (Stream A)

1. Migration `*_customer_reads.sql`: `customer_bookings()`, `customer_booking(code)`, `save_customer_travellers(code, travellers)`, `attach_customer_bookings()`; drop the customer policies of decision 5; `profiles.deletion_requested_at`. pgTAP: own rows only, zero rows from the tables, traveller rules (count, before departure, no extra keys), attach only when confirmed and only unowned bookings.
2. `src/modules/identity`: Server Actions and service for sign-in, sign-up (consent rows), password reset request and update, sign-out, change password, `/auth/callback` (Google, decision 3), attach after sign-in (decision 6); rate limits and Turnstile (decision 2). Unit tests.
3. Localized auth pages and the rebuilt staff `/auth` pages; Auth email templates (decision 15); `config.toml` Google provider block reading env (disabled by default).
4. Account area (decision 4): overview, bookings, booking detail with payments and the balance link, travellers editor, profile, change password. `messages/{vi,en}/account.json`, `auth.json`.
5. E2E: sign-up through Mailpit confirmation, an earlier guest booking attached, booking detail without internal fields, travellers edit, password change signs out other sessions, another customer's code shows nothing, axe at 375 and 1280 px; the starter sign-up path redirects.

### PR 5B — Guest booking lookup and deletion (Stream A)

6. Migration `*_booking_lookup.sql`: `booking_lookup_tokens`, `issue_booking_lookup()`, `redeem_booking_lookup()`; `anonymise_customer()` and its admin wrapper. pgTAP.
7. Lookup page, link page with the redeem button, `booking_lookup` email (VI/EN). Deletion request in the account area (decision 8) with the Auth Admin API steps. E2E: lookup with right and wrong details gives the same answer, the emailed link works once, deletion signs the user out for good and unlinks bookings.

### PR 5C — Inquiry inbox (Stream A)

8. Migration `*_inquiry_inbox.sql`: `assign_inquiry()`, `update_inquiry_status()`, the first-response rule (amends `create_quote()`), audit rows. pgTAP per role.
9. `/admin/inquiries` list and detail, notes, assignment, quote from inquiry; `sendInquiryEmails()` with the two templates. E2E per role (sales take and quote, operator reads, accountant has no access).

### PR 5D — Operations (Stream A)

10. `/api/cron/balance-reminders` and `/api/cron/departure-checks` (decisions 10–12), `vercel.json`, `CRON_SECRET` in the env schema and `.env.example`. Unit tests for the selection rules; E2E calls with and without the secret and checks `email_logs` and the flag.
11. Dashboard per role (decision 13) with role-checked read functions; passenger CSV export (decision 14); `/admin/customers` with export and anonymise (decision 16). pgTAP for the read functions; E2E per role.

### PR 5W — Tailor-made wizard and tour inquiry form (Stream B)

12. `create_tailor_made_inquiry()` (validated, privacy consent with the published version, source `tailor_made` or `tour_inquiry`), the 5-step wizard (destination → timing → travellers → budget and style → contact) with a browser draft (`localStorage`, cleared on success), Turnstile on first interaction, the prefilled form on private-tour pages, `InquirySuccess` with the code; calls `sendInquiryEmails()`. Flips `features.inquiry`.

## Acceptance criteria

- [ ] A customer signs up, confirms by email, signs in and sees their bookings, including an earlier guest booking made with the same address
- [ ] Customers cannot read internal booking or payment columns through the API (pgTAP on the tables and functions)
- [ ] Travellers can be edited until departure, never with passport numbers
- [ ] Sign-in, sign-up, password reset and booking lookup are rate-limited; sign-up, reset and lookup use Turnstile and never reveal whether an address exists
- [ ] Google sign-in works when configured and is hidden otherwise
- [ ] A guest finds a booking by code and email through a single-use, 30-minute emailed link
- [ ] Deletion anonymises the profile and Auth user, unlinks bookings, keeps legal records and consent proof, and is audit-logged
- [ ] Sales complete inquiry → quote → customer payment → confirmed booking (E2E; the Phase 5 acceptance in `DEVELOPMENT_PLAN.md`)
- [ ] Balance reminders go out 7 and 2 days before the due date, once each; overdue balances are flagged, never cancelled
- [ ] Departures below the minimum alert the team; dashboards show each role its numbers
- [ ] Passenger CSV export is audit-logged and has no passport numbers
- [ ] Cron routes refuse requests without the secret
- [ ] Account and auth pages have the nonce CSP with no violations; axe clean at 375 and 1280 px
- [ ] Lint, typecheck, unit, pgTAP, E2E green in CI

## Before go-live (owner accounts needed)

- Supabase SMTP (Resend) and the four Auth templates in the dashboard; site URL and redirect URLs for production and previews.
- Google OAuth client, if Google sign-in is wanted.
- Vercel Cron on the Pro plan with `CRON_SECRET`.
- Legal review of the deletion procedure and retention periods (Decree 13/2023, accounting and tour-operator record rules).

## Out of scope

Customer-initiated cancellations and date changes (P1), saved payment methods, wishlists, reviews written after a trip (P1), Zalo OA notifications (P1), reply templates (P1), multi-factor authentication for customers.

## Handover prompt

```text
Read CLAUDE.md, the docs it imports and docs/specs/phase-5-accounts-inquiries-operations.md.
Implement the next PR of your stream, one step per commit, following the decisions and the
cross-stream table. Customers read their data only through the customer-safe functions; never
reveal whether an email has an account; every email goes through the notification module with an
exactly-once key. Run lint, tsc, unit tests, pgTAP and the production build before each push.
Open the PR with an acceptance table, deviations and what is blocked by missing accounts.
```
