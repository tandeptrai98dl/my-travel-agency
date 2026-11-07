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
| Google OAuth | The Google button is not rendered and `/auth/callback` refuses a `google` flow. | Google Cloud OAuth client (ID and secret) set in Supabase; `GOOGLE_OAUTH_ENABLED=true`. |
| Vercel Cron | `/api/cron/*` works when called with the secret (CI and local call it directly); nothing runs on a schedule. | Vercel Pro project with `vercel.json` crons deployed and `CRON_SECRET` set (ADR-018). |
| Resend (transactional) | Emails are `skipped` rows in `email_logs` (ADR-036). | Same account as above. |
| Turnstile, Upstash | As in Phase 4: Turnstile skipped outside production, required there; rate limits per decision 2. | Keys (already needed for the contact form and booking). |

## Decisions taken in this spec (recommended defaults, owner pre-approved "recommended solutions")

1. **One sign-in for customers, the starter pages for staff.**
   - Customers use the localized pages `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau` (`/en/login`, `/en/register`, `/en/forgot-password`, `/en/reset-password`) under `src/app/(secure)/[locale]/(auth)/`, with the secure root's nonce CSP (ADR-027). Every form posts to a Server Action (Zod, rate limit, Turnstile where decision 2 says) that calls Supabase Auth on the server; no page calls Supabase from the browser (closes the known issue about the starter forms).
   - Staff keep `/auth/login`, `/auth/forgot-password` and `/auth/update-password` (Vietnamese, the admin language), rebuilt on the same Server Actions. `/auth/sign-up` and `/auth/sign-up-success` are removed (staff are invited, ADR-032) and redirect to `/dang-ky`. The rebuilt `/auth/*` pages keep the public nonce-free policy of ADR-027 (`next.config.ts`: `script-src 'self' 'unsafe-inline'`, `form-action 'self'`, `frame-ancestors 'none'`): they are static forms that post to Server Actions and render no booking or customer data. This names the `/auth/*` CSP asked for in the Phase 3 backlog.
   - A staff member who signs in on a customer page lands on `/admin`; a customer who signs in on `/auth/login` lands on `/tai-khoan`. `next` parameters pass through `safeRedirectPath()`.
   - Sign-up asks for name, email, password (at least 10 characters, checked against Supabase's leaked-password setting where available), language from the page, and the privacy policy (required, recorded in `consent_records` with the published version, ADR-035) and marketing (optional, unticked). Sign-up is **disabled** (form shown disabled with a note, action refuses) while the privacy policy is not published in the page's language (ADR-035), and while the email-confirmation guard of decision 6 reports confirmations off.
   - Email confirmation stays on (`enable_confirmations = true`, `double_confirm_changes = true`). "Resend confirmation" is offered on the "check your email" page and has its own limit (decision 2).
   - Password reset: the emailed link goes to `/auth/confirm?type=recovery`, which verifies the token hash on the server, signs the user in and sets a short-lived (15 minutes) httpOnly, `SameSite=Lax`, HMAC-signed marker cookie bound to the user id. `/dat-lai-mat-khau` (and the staff `/auth/update-password`) accept only a session with a matching marker; an ordinary session is sent to the account's change-password form (which asks for the current password). After the new password is saved the marker is cleared and other sessions are signed out (`signOut({ scope: "others" })`). Staff invitations (ADR-032) set the same marker for `type=invite`.
   - Answers never reveal whether an address has an account: sign-up, password reset, resend confirmation and booking lookup always show the same "check your email" message.
2. **Rate limits and Turnstile** (`src/lib/rate-limit.ts`, ADR-029 fail modes):

   | Action | Limit | Fail mode | Turnstile |
   | --- | --- | --- | --- |
   | Sign-in | 10 per IP and 5 per email per 10 min | open (logged): no email is sent | no (reconsider if abused) |
   | Sign-up | 5 per IP per hour, 3 per email per day | closed (sends email) | yes |
   | Resend confirmation | 3 per email and 10 per IP per hour | closed (sends email) | yes |
   | Password reset request | 5 per IP and 3 per email per hour | closed | yes |
   | Booking lookup | 5 per IP and 3 per code per 10 min | closed | yes |
   | Inquiries (wizard, tour form) | as the contact form: 5 per IP per 10 min, 3 per email per day | closed | yes (Stream B) |
   | Email change | 5 per user per hour | closed (sends email to both addresses) | no (signed in; current password required) |
   | Change password, deletion request | 5 per user per hour | closed | no (signed in; current password required) |

   - **GoTrue sees the server, not the customer.** Every Auth call comes from a Vercel function, so Supabase's per-IP limits count all customers on that function's IP together. `supabase/config.toml` `[auth.rate_limit]` is therefore set deliberately and the owner sets the same values in the hosted dashboard: `sign_in_sign_ups = 300` and `token_refresh = 1800` per 5 minutes (so one busy function IP cannot lock everyone out), `token_verifications = 300`, `email_sent` as the SMTP plan allows (local and CI: high enough for the E2E run). The app's **per-email** limits above (keyed on the normalised address, hashed in Redis) are the real guard against guessing a password; the per-IP limits use the client IP from Vercel's `x-forwarded-for`. The sign-in limit fails open, so during an Upstash outage only GoTrue's shared limit stands; the outage is logged (`rate_limit.fail_open`).
3. **Google sign-in** only when configured: `GOOGLE_OAUTH_ENABLED=true` (server env, validated) and the provider set in Supabase. `/auth/callback` exchanges the PKCE code on the server, refuses missing or failed codes with the auth error page, applies `safeRedirectPath()` to `next`, and runs decision 6. Google accounts are always customers (role changes stay admin-only). If the account behind the callback has a staff profile (GoTrue links a Google identity to an existing account with the same verified address), the callback signs it out and redirects to `/auth/login`: staff sign in with a password (and TOTP for admin and accountant) only.
4. **Account area** (`/tai-khoan`, `/en/account`), in `(secure)/[locale]/account/`, fully dynamic, signed-in customers only (others go to sign-in with `next`; staff go to `/admin`):
   - Overview: upcoming and past bookings, balance due, profile summary.
   - Bookings list and booking detail (`/tai-khoan/booking/[code]`): price lines, payments (amount, method, date, status), balance with a "pay the balance" link into the checkout (the owner's session already opens it, decision 7 of Phase 4), the cancellation policy snapshot, travellers.
   - Travellers: add and edit name, date of birth, nationality and dietary notes until the departure date; never passport numbers (ADR-016); at most adults + children + infants rows; one lead traveller.
   - Profile: name, phone, country, language through the session client (column grants, decision 5); marketing consent only through `set_marketing_consent(granted, document_version)` (definer, authenticated), which updates the column and writes the `consent_records` row in one transaction. Email changes go through Supabase's confirmation flow (both addresses confirm, `double_confirm_changes`).
   - Change password: current password re-checked first, then `updateUser`; other sessions signed out (`signOut({ scope: "others" })`).
   - Data deletion request (decision 8).
5. **Customer-safe reads close the Phase 0 limit.** Customers read their data only through `security definer` functions (`search_path = ''`, execute for `authenticated` only) that filter on `auth.uid()`, return nothing for a profile that is deactivated or has `deleted_at` set (an access token outlives a deletion by up to its expiry), and return a fixed set of columns:
   - `customer_bookings()`: code, status, payment state, tour title and code from the snapshot, dates, party, total, amount paid, balance due date, created at.
   - `customer_booking(code)`: the above plus price lines, travellers, payments (amount, kind, provider, status, paid at; no `raw_response`, `note`, `recorded_by`, `provider_txn_id`), the cancellation-policy summary and whether travellers can still be edited.
   - `save_customer_travellers(code, travellers jsonb)`: replaces the booking's travellers in one transaction under the rules of decision 4, writes a `booking_events` row (`travellers_updated`, actor the customer).
   - Then the direct customer policies are dropped: `bookings: customer read own`, `booking_items: customer read own`, `payments: customer read own`, and the three `travellers: customer …` policies. Internal columns (`needs_attention`, `attention_reason`, `assigned_to`, `idempotency_key`, `utm`, payment `raw_response`, `note`, `recorded_by`) are no longer reachable by customers. pgTAP proves a customer gets zero rows from the tables and only their own rows from the functions, and that another customer's code returns nothing.
   - Profiles: the table-level `UPDATE` on `profiles` is revoked from `authenticated` and granted back on `full_name`, `phone`, `country`, `avatar_url`, `locale` (the customer's own row) and `role`, `is_active`, `deleted_at`, `email` (admin only, still enforced by `guard_profile_update()` and `keep_active_admin()`). `marketing_consent` and the new `deletion_requested_at` are not writable by API roles; `guard_profile_update()` also refuses changes to them from `anon` and `authenticated` (defence in depth; definer functions and the service role are trusted). pgTAP proves both refusals.
6. **Earlier bookings attach only after a real email confirmation.**
   - `attach_customer_bookings()` (`security definer`, authenticated) reads the caller's address from `auth.users.email` **looked up by `auth.uid()`**, never from the JWT `email` claim or `profiles.email`, and does nothing unless that row's `email_confirmed_at` is set. It sets `customer_id = auth.uid()` on bookings whose `lower(contact_email)` equals that address and whose `customer_id` is null, writes a `booking_events` row (`attached_to_account`) per booking and returns the count. Bookings attached to another account never move.
   - **Guard against auto-confirmed emails** (account takeover: with "Confirm email" off, GoTrue sets `email_confirmed_at` at sign-up, so anyone could register a victim's address and receive their bookings). The identity service reads GoTrue's public `GET /auth/v1/settings` (with the publishable key; cached for 5 minutes in memory) and, when `mailer_autoconfirm` is `true` or the settings cannot be read, **does not call `attach_customer_bookings()`** and **disables sign-up** (decision 1), logging `auth.autoconfirm_guard` with the reason (once per cache period). Unit tests cover: autoconfirm on → no attach and sign-up refused; settings unreachable → the same (fail closed); autoconfirm off → attach runs.
   - Called after every successful sign-in, email confirmation and OAuth callback (idempotent). A Google address counts as verified when GoTrue marks it confirmed. An email change re-runs it after the new address is confirmed.
   - Signing up again after a deletion (decision 8) with the same address re-attaches the bookings that deletion unlinked, once the new account confirms the address: the bookings keep their contact email, and confirming it is the same proof as for a guest booking.
7. **Guest booking lookup** (`/tra-cuu-booking`, `/en/booking-lookup`):
   - Form: booking code and email, Turnstile, decision 2's limits. The answer is always "if the details match, we have emailed a link", whatever matched, and it is returned before any email work.
   - `issue_booking_lookup(code, email, token_hash, minutes)` (service role only, a thin wrapper over `booking_access_tokens` with purpose `lookup`, ADR-038) stores the token hash only when the code and email match a booking and that booking has fewer than **3** unused, unexpired lookup tokens; it returns the booking id and locale to the booking service (or nothing). Nothing it returns reaches the response.
   - The token is 32 random bytes (only its SHA-256 stored), valid for `settings.booking_rules.booking_lookup_link_minutes` (default 30). The email (template `booking_lookup`, the booking's language, exactly-once key `booking_lookup:<token id>`, ADR-036) is sent in `after()`, so the answer takes the same time whether or not it matched.
   - The link page shows a button; the click redeems the token once (`redeem_booking_access_token`) and sets the booking's access cookie (Phase 4 decision 7), then opens the checkout summary. Scanners that GET the page use nothing.
   - Stream A sets nothing in the public shell; Stream B flips `features.bookingLookup` to show the footer link once this PR is merged.
8. **Data deletion** (Decree 13/2023/ND-CP and the Personal Data Protection Law; **the whole procedure and the retention period need legal review before launch**):
   - **Request.** The customer asks from the account area, re-entering their password. `profiles.deletion_requested_at` is set first (service role). If they have no booking with a departure ahead and no open money (`pending_payment`, a confirmed booking with a balance, or an open money reason in the attention queue), the deletion runs at once; otherwise the customer is told why, and the request appears on the admin customer page and dashboard. An MFA-verified admin can run it later through a role-checked wrapper with a note.
   - **What happens to each table** (the customer's rows are found by `profiles.id` and by the confirmed `auth.users.email` of decision 6):

     | Table | Treatment |
     | --- | --- |
     | `profiles` | kept as a row for foreign keys: `full_name`, `phone`, `country`, `avatar_url` null, `email` `deleted+<id>@invalid.local`, `marketing_consent` false, `deleted_at` now |
     | `auth.users` | banned, then soft-deleted (below): email and phone obfuscated, password, identities, MFA factors and sessions removed; the row stays, so the `profiles` cascade never fires |
     | `bookings`, `booking_items`, `travellers`, `payments`, `booking_events` | **kept** with contact details and snapshots for the retention period: 10 years from the end of the accounting year (Law on Accounting 2015, art. 41, for records behind invoices and payments; to be confirmed by legal counsel together with tour-operator record rules). Bookings are unlinked (`customer_id` null). A purge of expired records is a Phase 6 runbook item |
     | `inquiries` without a booking | anonymised: `name` "Đã xoá", `email` `deleted+<id>@invalid.local`, `phone`, `company_name`, `message`, `destinations_other`, `utm` null |
     | `inquiries` linked to a kept booking | kept with the booking |
     | `internal_notes` | deleted where `customer_id` is the profile, and on the inquiries anonymised above |
     | `subscribers` | the row for the address is deleted; a `marketing` withdrawal (`granted = false`) is written to `consent_records` |
     | `consent_records` | kept as proof of consent (legal obligation) |
     | `email_logs` | `to_email` replaced with `deleted+<id>@invalid.local` on every row for the address (rows stay for the exactly-once keys) |
     | `reviews` linked to the customer's bookings | `author_name` reduced to initials ("N. V. A."); the text stays, as published |
     | `booking_access_tokens` | unused tokens of the customer's bookings deleted |
     | `audit_logs` | `customers.anonymise` with the actor and counts per table, no personal data |

   - **Order and failure.** (1) Ban the Auth user and revoke its sessions: `auth.admin.updateUserById(id, { ban_duration: "876000h", user_metadata: {} })` (blocks sign-in and token refresh at once, and clears the name kept in metadata), then, for a customer's own request, `auth.admin.signOut(<their access token>, "global")`; an access token already issued stays valid until it expires, but decision 5's functions return nothing once step 2 has run. (2) `anonymise_customer(profile_id)` (service role) does every SQL change in the table above in **one transaction** and is idempotent (a second run changes nothing). (3) `auth.admin.deleteUser(id, true)`: GoTrue's soft delete obfuscates the email and phone, removes the password, soft-deletes identities and deletes MFA factors and every session, and keeps the `auth.users` row (a hard delete would cascade to `profiles` and fail on the bookings' foreign keys, and would free the user id). Chosen over randomising the password and deleting identities by hand: one supported call does all of it. If any step fails, `deletion_requested_at` stays set, the step that failed is logged (error code only), the customer sees "we have received your request", and the request stays on the admin page until all three steps have run (the admin read checks `profiles.deleted_at` and `auth.users.deleted_at`); a retry runs the remaining steps.
   - **Data export** on request (FEATURES "Customers"): the admin customer page downloads a JSON of the profile, bookings, travellers, consents and inquiries for that address, audit-logged first (like the subscriber export).
9. **Inquiry inbox** (`/admin/inquiries`, Stream A):
   - **Permissions (a change to the `ARCHITECTURE.md` matrix, recorded in ADR-037):** sales see and work inquiries assigned to them or unassigned, and may take an unassigned one; `sales_manager` and admin see **every** inquiry and assign anyone (to a sales role or to nobody); operator reads; accountant and editor have no access. A migration widens the `sales_manager` read policy to all rows.
   - **Writes only through functions.** `UPDATE` on `inquiries` is revoked from `authenticated` (no column grant remains; the two update policies are dropped), so `status`, `assigned_to` and `first_responded_at` change only through role-checked `security definer` functions that also write `audit_logs`: `assign_inquiry(target_id, assignee)` (sales: only themselves on an unassigned row; managers and admin: anyone), `update_inquiry_status(target_id, status, note)` and `add_inquiry_note(target_id, body, contacted boolean)`. pgTAP proves a direct update of each of those columns fails for sales, sales_manager and admin, and per role what each function allows.
   - List filtered by status, owner (mine, unassigned, everyone for managers and admin) and source, sorted by age; time to first response shown per row and as a median on the dashboard.
   - Detail: the inquiry, linked tour, consent version, notes (`internal_notes`), status changes, linked booking.
   - **First response:** `first_responded_at` is set once, by the first of: a status change away from `new` (`update_inquiry_status()`), a note with `contacted = true` (`add_inquiry_note()`), or a quote (`create_quote()`, amended). Never by the client.
   - Quote from inquiry: a button opens `/admin/bookings/new?inquiry=<code>` with the contact, party and tour prefilled (the 4D form already accepts the inquiry code and marks the inquiry `quoted`).
   - Emails: Stream A provides `sendInquiryEmails(inquiryId)` in `src/modules/inquiry/inquiry-emails.service.ts` (customer confirmation with the inquiry code in the inquiry's language; team alert to `settings.contact.email` within a minute), keyed `inquiry_received:<id>` and `inquiry_alert:<id>`. Stream B's actions call it after their write commits.
   - **File names in `src/modules/inquiry`:** Stream A owns `inquiry-emails.*` and `inquiry-admin.*` (`.service`, `.repository`, `.schemas`, `.actions`, tests); Stream B owns `contact.*` (existing) and `tailor-made.*`. Neither edits the other's files.
10. **Balance reminders and overdue alerts** (`/api/cron/balance-reminders`, daily at 01:43 UTC, 08:43 in Vietnam):
    - "Today" and every due date are computed in `Asia/Ho_Chi_Minh` (`balance_due_date` is a local date); `days_left = balance_due_date - today`.
    - Reminders: for confirmed bookings with a balance (`amount_paid < total`) and `0 <= days_left`, the job picks the **smallest** N in `settings.booking_rules.balance_reminder_days_before_due` (default 7 and 2) with `days_left <= N` and sends the 4E balance reminder keyed `balance_reminder:<booking id>:<N>d`. A run that was missed still sends the reminder the next day; once the 2-day window applies the 7-day one is never sent; a rerun the same day sends nothing (the key is spent).
    - Overdue: nothing is stored on the booking. Phase 4 already derives `balance_overdue` in the attention queue (`DERIVED_REASONS` in `src/modules/booking/booking-admin.schemas.ts`, `attentionQueue()`), so it appears and clears on its own when the balance is paid. The job only sends a **one-time team alert** per overdue booking, keyed `balance_overdue:<booking id>` (ADR-016: remind and flag, never cancel).
    - Logs counts only (no addresses).
11. **Minimum-traveller alerts** (`/api/cron/departure-checks`, daily): for departures within 21 days whose confirmed adults + children are below the tour's `min_pax_to_operate`, a team alert (`min_pax:<departure id>:<days bucket>` at 21, 14 and 7 days, dates in `Asia/Ho_Chi_Minh`) and a dashboard count. Operators decide; nothing is cancelled automatically.
12. **Cron secret.** `vercel.json` declares the schedules. Vercel sends `Authorization: Bearer <CRON_SECRET>`; routes compare the SHA-256 digests of the received and expected values with `timingSafeEqual` (equal lengths by construction, since `timingSafeEqual` throws on unequal lengths) and answer 401 otherwise, 503 when `CRON_SECRET` is not set (validated: at least 32 characters when present, required when `VERCEL_ENV === "production"`). Routes are `GET`, idempotent, never cached and run the work through the service role inside `src/modules/*`. CI calls them with a CI-only secret.
13. **Dashboard per role** (`/admin`), from one read per role through role-checked definer functions:
    - Sales: new bookings (last 7 days, theirs), my open inquiries, unassigned inquiries, my quotes awaiting payment, median time to first response (30 days). `sales_manager`: the same for the whole team.
    - Operator: departures in the next 14 days with seats and travellers filled, departures below minimum, bookings missing traveller details.
    - Accountant: revenue collected this month (payments `succeeded` less refunds), payments about to expire, unmatched transfers, the money part of the attention queue.
    - Editor: drafts and items missing translations or alt text.
    - Admin: all of the above, new bookings for everyone, and deletion requests.
14. **Passenger list export** (operator, admin): per departure, a CSV of confirmed and completed bookings' travellers (name, date of birth, nationality, dietary notes, booking code, lead flag; contact phone of the lead only), no passport numbers, formulas neutralised as in the subscriber export, refused unless its `audit_logs` row (`departures.passenger_export`, actor, departure, row count) is written first.
15. **Auth emails in both languages.** Supabase templates (`supabase/templates/confirmation.html`, `recovery.html`, `email_change.html`, plus the existing `invite.html`) branch on `{{ .Data.locale }}` from user metadata and link to `/auth/confirm?token_hash=…&type=…&next=…`, which verifies on the server and sends the customer to their localized page. Hosted projects need the same templates set in the dashboard (owner).
16. **Customers admin** (`/admin/customers`, FEATURES "Customers"): list with search by name or email, detail with bookings, inquiries, notes (sales roles), consent history, deletion request state; export and anonymise for an MFA-verified admin (decision 8).

## Documentation updates and their owners

Each PR updates the docs for what it ships, so `main` never documents something that does not exist yet.

| Document | Change | PR |
| --- | --- | --- |
| `ARCHITECTURE.md` "Routes" | customer auth and account routes as built, `/auth/callback`, staff sign-up removed | 5A |
| `ARCHITECTURE.md` "Routes" | booking lookup link page; `/api/cron/balance-reminders`, `/api/cron/departure-checks` | 5B, 5D |
| `ARCHITECTURE.md` "Authorization" | `sales_manager` sees and assigns every inquiry (decision 9): recorded in this spec PR; 5C removes the "enforced from 5C" note when the policy ships | spec, 5C |
| `DATABASE.md` | dropped customer policies, `customer_*` functions, `attach_customer_bookings()`, `set_marketing_consent()`, `profiles.deletion_requested_at`, profile column grants; remove the Phase 5 entry from "Known Phase 0 limits" and the customer row of the policy table | 5A |
| `DATABASE.md` | `issue_booking_lookup()`, `anonymise_customer()` and its wrapper | 5B |
| `DATABASE.md` | inquiry functions, widened `sales_manager` policy, revoked `UPDATE`, amended `create_quote()` | 5C |
| `DATABASE.md` | dashboard read functions | 5D |
| `README.md`, `.env.example` | `GOOGLE_OAUTH_ENABLED`, Auth templates, `[auth.rate_limit]` values, "Confirm email" | 5A |
| `README.md`, `.env.example` | `CRON_SECRET` (32+ characters), `vercel.json` schedules | 5D |
| `DESIGN_SYSTEM.md` | Account, auth and inbox components as built | each PR |

## As shipped (notes against the decisions above)

- **PR 5A, Google flag:** the server variable is `GOOGLE_OAUTH_ENABLED`, which existed since Phase 0 (`.env.example`, `README.md`). ADR-037 names it `AUTH_GOOGLE_ENABLED`; read that as `GOOGLE_OAUTH_ENABLED`.
- **PR 5A, rate limits and Turnstile off Vercel:** without `VERCEL_ENV` (local and CI), a service that is not configured is skipped with one warning. On every Vercel environment both are enforced as in decision 2.
- **PR 5A, after the #42 review:**
  - `attach_customer_bookings(target_id)` and `set_marketing_consent(target_id, granted, document_version)` are service-role only (`*_customer_reads_review.sql`). A session could call the first through PostgREST and skip the confirmation guard of decision 6, so the identity service calls it with the admin client, for the user `getUser()` returns, only after `confirmationGuard()` reported confirmations on.
  - The account service passes the published privacy policy's version to the marketing write; the function refuses anything but `privacy-(vi|en)-<16 hex>`.
  - A traveller birth date that does not exist is `invalid_traveller`.
  - An unreadable GoTrue settings answer is cached for 30 seconds, not five minutes.
- **PR 5D, operations:**
  - One migration (`20261111100000_operations.sql`) for both steps; it lands with step 10 because the departure-checks job reads `departures_below_minimum()`. Guaranteed departures are not alerted (the operator already decided); open and closed ones are.
  - Team alerts: the overdue balance reuses the staff booking email (template `balance_overdue`); the minimum-traveller alert is a new staff email (template `min_pax`, no booking). Without `settings.contact.email` neither is claimed, so a later run sends it once the address exists.
  - Dashboard definitions: "new bookings" leave drafts out; "payments about to expire" are pending payments within 30 minutes; "money attention" counts flagged money reasons and overdue balances; "missing translations" counts published tours, articles, destinations, travel styles and pages with fewer than two published languages. The Phase 4 "Việc cần làm" counts stay above the figures.
  - Passenger list: a confirmed booking without traveller rows is listed with its contact as the lead, and every row carries the party size, so operators see missing details. The export is one definer function that writes the audit row in the same transaction before returning rows.
  - Deletion: `admin_anonymise_customer()` and `finishDeletionAsAdmin()` refuse while a blocker remains (`blocked`); a retry after the SQL step skips that check and runs the Auth step left. `customer_deletion_blockers()` is the read-only half of `request_customer_deletion()`. The ban now sends every `user_metadata` key as null: GoTrue merges metadata, so 5B's `{}` kept the name. The E2E reads `auth.users` with psql (5B's REST read of the `auth` schema always came back empty).
  - Customers admin: notes are written by sales roles and admin and read by operators (the `internal_notes` policies); the consent history comes from `customer_consents()` (no IP or user agent) for every role that reads customers, while the export (admin only) includes them. Code lives in `src/modules/account/customers-admin.*` (next to the deletion service) and `src/modules/operations/*`.

## Cross-stream items

| What | Stream A (owner) | Stream B | When |
| --- | --- | --- | --- |
| Customer auth pages, `/auth/callback`, starter `/auth` rebuild | `(secure)/[locale]/(auth)/`, `src/modules/identity`, `src/app/auth/*` | links "Sign in" / "My account" in the header only after PR 5A merges (`features.accounts`, flipped by Stream B) | PR 5A |
| Account area and customer-safe functions | `(secure)/[locale]/account/`, migration, pgTAP < 30 | none | PR 5A |
| Guest booking lookup | page under `(secure)/[locale]/(booking)/booking-lookup`, functions, template | flips `features.bookingLookup` (footer link) after PR 5B merges | PR 5B |
| Inquiry write path | none (never edits `contact.*` or `tailor-made.*`) | `create_tailor_made_inquiry(...)` (service role, like `create_contact_inquiry()`), migration in its range, pgTAP ≥ 30; the wizard and the tour inquiry form in `src/modules/inquiry/tailor-made.*` | PR 5W (Stream B) |
| Inquiry emails | `sendInquiryEmails(inquiryId)` in `src/modules/inquiry/inquiry-emails.*` and the two templates in `emails/` | calls it after the write commits; never builds email itself | PR 5C before 5W merges |
| Inquiry inbox, quote from inquiry | `/admin/inquiries`, `src/modules/inquiry/inquiry-admin.*`, `assign_inquiry()`, `update_inquiry_status()`, `add_inquiry_note()`, revoked `UPDATE` on `inquiries`, first-response rule | the `source` values it writes (`tailor_made`, `tour_inquiry`) | PR 5C |
| Inquiry fields | adds nothing to `inquiries` without agreement | maps wizard steps to existing columns (`destination_ids`, `destinations_other`, `travel_style_id`, `travel_month`, `flexible_dates`, `duration_days`, `adults`, `children`, `budget_per_person`, `company_name`, `preferred_contact`, `message`, `utm`) | PR 5W |
| `features` flags (`src/lib/features.ts`) | none | owns the file; flips `inquiry`, `bookingLookup`, `accounts` | after each Stream A PR |
| Strings | `messages/{vi,en}/account.json`, `auth.json`, `admin-inquiries.json`, `emails.json` | `public-inquiry.json` | — |
| Cron routes and `vercel.json` | `/api/cron/*`, `vercel.json` | none | PR 5D |

## Stream rules

- Migrations: timestamps later than main's newest when the branch merges (rename on rebase). Stream A's pgTAP files stay below 30, Stream B's at 30 and above.
- ADRs: this spec records ADR-037 (ADR-038 came with PR #39); new ones from ADR-039. If two branches clash, the one that merges second renumbers.
- Stream A does not edit `src/app/(public)`; Stream B does not edit `src/app/(secure)`, the admin or `src/modules/{identity,booking,payment,notification}`.

## Steps

One pull request per group, one commit per step. Every Server Action and Route Handler: Zod, rate limit, `requireRole()` for staff, then a service. Every function and policy gets pgTAP; every service gets unit tests; sign-in, deletion and lookup get E2E.

### PR 5A — Customer auth, account area, customer-safe reads (Stream A)

1. Migration `*_customer_reads.sql`: `customer_bookings()`, `customer_booking(code)`, `save_customer_travellers(code, travellers)`, `attach_customer_bookings()` (address from `auth.users` by `auth.uid()`), `set_marketing_consent()`; drop the customer policies of decision 5; `profiles.deletion_requested_at`; profile column grants and the extended `guard_profile_update()`. pgTAP: own rows only, zero rows from the tables, nothing for a deleted profile, traveller rules (count, before departure, no extra keys), attach only when `auth.users.email_confirmed_at` is set, only unowned bookings, never from a forged JWT `email` claim or a changed `profiles.email`; `marketing_consent` and `deletion_requested_at` not writable by customers.
2. `src/modules/identity`: Server Actions and service for sign-in, sign-up (consent rows), resend confirmation, password reset request and update (recovery marker), sign-out, change password, email change, `/auth/callback` (Google, staff refused, decision 3), attach after sign-in with the autoconfirm guard (decision 6); rate limits and Turnstile (decision 2). Unit tests, including the guard (autoconfirm on, settings unreachable, off).
3. Localized auth pages and the rebuilt staff `/auth` pages; Auth email templates (decision 15); `config.toml` Google provider block reading env (disabled by default) and the `[auth.rate_limit]` values of decision 2.
4. Account area (decision 4): overview, bookings, booking detail with payments and the balance link, travellers editor, profile, change password. `messages/{vi,en}/account.json`, `auth.json`.
5. E2E: sign-up through Mailpit confirmation, an earlier guest booking attached, booking detail without internal fields, travellers edit, password change signs out other sessions, the reset page refuses a session without the recovery marker, another customer's code shows nothing, axe at 375 and 1280 px; the starter sign-up path redirects.

### PR 5B — Guest booking lookup and deletion (Stream A)

6. Migration `*_booking_lookup.sql`: `issue_booking_lookup()` over `booking_access_tokens` (purpose `lookup`, at most 3 open per booking); `anonymise_customer()` (every table of decision 8, one transaction, idempotent) and its admin wrapper. pgTAP per table of decision 8.
7. Lookup page, link page with the redeem button, `booking_lookup` email (VI/EN) sent in `after()`. Deletion request in the account area (decision 8) with the three steps in order; unit tests for a failure at each step (request stays visible, retry runs the rest). E2E: lookup with right and wrong details gives the same answer, the emailed link works once, deletion signs the user out for good and unlinks bookings, signing up again with the address re-attaches them.

### PR 5C — Inquiry inbox (Stream A)

8. Migration `*_inquiry_inbox.sql`: widen the `sales_manager` read policy; revoke `UPDATE` on `inquiries` from `authenticated` and drop its update policies; `assign_inquiry()`, `update_inquiry_status()`, `add_inquiry_note(..., contacted)`, the first-response rule (amends `create_quote()`), audit rows. pgTAP per role, including direct updates of `status`, `assigned_to` and `first_responded_at` failing.
9. `/admin/inquiries` list and detail, notes, assignment, quote from inquiry; `sendInquiryEmails()` with the two templates. E2E per role (sales take and quote, a sales manager assigns another seller's inquiry, operator reads, accountant has no access).

### PR 5D — Operations (Stream A)

10. `/api/cron/balance-reminders` and `/api/cron/departure-checks` (decisions 10–12), `vercel.json`, `CRON_SECRET` in the env schema and `.env.example`. Unit tests for the selection rules (smallest window, catch-up after a missed day, Vietnam dates around midnight UTC) and the digest comparison; E2E calls with and without the secret and checks `email_logs` keys and the derived attention reason.
11. Dashboard per role (decision 13) with role-checked read functions; passenger CSV export (decision 14); `/admin/customers` with export and anonymise (decision 16). pgTAP for the read functions; E2E per role.

### PR 5W — Tailor-made wizard and tour inquiry form (Stream B)

12. `create_tailor_made_inquiry()` (validated, privacy consent with the published version, source `tailor_made` or `tour_inquiry`), the 5-step wizard (destination → timing → travellers → budget and style → contact) with a browser draft (`localStorage`, cleared on success), Turnstile on first interaction, the prefilled form on private-tour pages, `InquirySuccess` with the code; calls `sendInquiryEmails()`. Flips `features.inquiry`.

## Acceptance criteria

- [ ] A customer signs up, confirms by email, signs in and sees their bookings, including an earlier guest booking made with the same address; nothing attaches while Supabase auto-confirms emails
- [ ] Customers cannot read internal booking or payment columns through the API (pgTAP on the tables and functions)
- [ ] Travellers can be edited until departure, never with passport numbers
- [ ] Sign-in, sign-up, password reset and booking lookup are rate-limited; sign-up, reset and lookup use Turnstile and never reveal whether an address exists
- [ ] Google sign-in works when configured and is hidden otherwise
- [ ] A guest finds a booking by code and email through a single-use, 30-minute emailed link
- [ ] Deletion covers every table of decision 8, anonymises the profile and Auth user, unlinks bookings, keeps legal records and consent proof, survives a failed step, and is audit-logged
- [ ] Inquiry status, owner and first response change only through the inquiry functions; sales managers see and assign every inquiry
- [ ] Sales complete inquiry → quote → customer payment → confirmed booking (E2E; the Phase 5 acceptance in `DEVELOPMENT_PLAN.md`)
- [ ] Balance reminders go out 7 and 2 days before the due date, once each (the 7-day one skipped once the 2-day one applies); overdue balances show in the attention queue and alert the team once, never cancelled
- [ ] Departures below the minimum alert the team; dashboards show each role its numbers
- [ ] Passenger CSV export is audit-logged and has no passport numbers
- [ ] Cron routes refuse requests without the secret
- [ ] Account and auth pages have the nonce CSP with no violations; axe clean at 375 and 1280 px
- [ ] Lint, typecheck, unit, pgTAP, E2E green in CI

## Before go-live (owner accounts needed)

- Supabase Auth: **"Confirm email" ON** and "Secure email change" ON (with confirmations off, GoTrue auto-confirms addresses; the app then refuses sign-up and attaching bookings, decision 6); the `[auth.rate_limit]` values of decision 2.
- Supabase SMTP (Resend) and the four Auth templates in the dashboard; site URL and redirect URLs for production and previews.
- Google OAuth client, if Google sign-in is wanted.
- Vercel Cron on the Pro plan with `CRON_SECRET`.
- Legal review of the deletion procedure and the 10-year retention period (Decree 13/2023, the Personal Data Protection Law, the Law on Accounting and tour-operator record rules).

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
