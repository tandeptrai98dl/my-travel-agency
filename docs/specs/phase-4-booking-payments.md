# TASK-P4: Booking and payments

Phase 4 of `DEVELOPMENT_PLAN.md`. Customers book a group tour and pay a deposit or the full price online (VNPay, VietQR bank transfer). Sales turn private-trip inquiries into quoted bookings paid through a payment link. Staff manage bookings, payments, refunds and the "needs attention" queue. Seats and money change only in Postgres functions. A payment is confirmed only from a verified IPN or webhook, or recorded by an MFA-verified accountant with a note (ADR-012).

Stream A (ADR-025). Stream B continues Phase 3 in parallel. The cross-stream items are listed below.

## Inputs

- `ARCHITECTURE.md`: "Book-now flow", "Booking lifecycle", "Payment adapter", "Authorization" (matrix), "Security" (payments, application), "Monitoring", "Rendering and caching".
- `DATABASE.md`: the booking and payment tables, "Column grants", "Postgres functions", "Known Phase 0 limits" (customer columns, Phase 5).
- `FEATURES.md` "Booking and payment", "Private and tailor-made trips", admin "Bookings" and "Payments".
- ADR-005, ADR-011 (money and snapshots), ADR-012 (functions, verified confirmation), ADR-013 (VNPay, VietQR + SePay/Casso), ADR-014, ADR-015 (cache), ADR-016 (business defaults), ADR-024 (prices), ADR-026 (departure rules), ADR-027 (CSP), ADR-032 (settings, staff).
- `docs/specs/phase-3-public-site.md` decision 3 (the Phase 4 note on the `tours` cache tag), decision 9 (the `booking` feature flag) and PR H's `BookingBox`.

## Owner accounts and modes

None of the gateway accounts exist yet. Every integration has an off mode, and none of them ever confirms a payment without verification:

| Service | Without credentials | With sandbox credentials | Blocked until the owner provides |
| --- | --- | --- | --- |
| VNPay | Method hidden at checkout. | Sandbox `vnp_TmnCode`/`vnp_HashSecret`. CI uses a CI-only secret and a local stub of the VNPay payment page (`VNPAY_STUB=true`, refused in production). The stub signs its IPN with that secret, so verification runs unchanged. | Merchant contract and production keys; limits and fees for large amounts. |
| VietQR bank transfer | Method hidden while `settings.bank_account` is incomplete. | Shown when the account is set. Without a webhook, transfers stay `pending` until an accountant records them (4F). | Receiving account; choice of SePay or Casso. |
| SePay / Casso webhook | Route answers 503 and records nothing. | API key in `BANK_WEBHOOK_SECRET`; CI posts signed test payloads. | Account and webhook key. |
| Resend | Emails written to `email_logs` with status `skipped` and logged. | — | Account, domain, SPF/DKIM/DMARC. |
| Turnstile | Skipped outside production (test keys in CI). Required in production by the env schema. | Cloudflare test keys. | Site key and secret. |
| Upstash | Rate limits skipped with a log line (as for redirects). | — | Account (already needed for redirects). |

## Decisions taken in this spec (recommended defaults, owner pre-approved "recommended solutions")

1. **Pricing lives in `src/modules/booking/pricing.ts`.** It is pure and integer-only through `@/lib/money`. `priceBooking(departure, tour, pax, plan, today)` returns the price lines (`booking_items` types) and the totals, deposit, balance due date and allowed plans.
   - Children pay `price_child`, or `price_adult` when that is null. Infants pay `price_infant`, or 0 when that is null.
   - The single supplement is charged per single room. Single rooms are at most the number of adults.
   - Deposit = `ceil(total × deposit_percent / 100)` rounded up to 1 000 đ, never above the total.
   - The deposit plan is offered only when the departure is more than `balance_due_days` days away (Vietnam date). Otherwise only full payment is offered.
   - Balance due date = start date − `balance_due_days`.
   - Party rules: at least one adult; infants × 2 ≤ adults (ADR-016); adults + children between the tour's `min_pax` and `max_pax` and never above the seats left. Infants take no seat.
   - The browser never sends a price. Every step recomputes on the server. The draft keeps its lines and a tour snapshot (ADR-011).
2. **Prices at payment time.** `reserve_and_create_payment()` compares the booking's unit prices with the departure's current prices. If an admin changed them since the draft, it raises `price_changed`. The service then reprices the draft and shows the new total before the customer pays again. Nothing is charged at an old price.
3. **State machine** in `src/modules/booking/state-machine.ts`. It holds the allowed transitions from `ARCHITECTURE.md` "Booking lifecycle" and is unit-tested. The SQL functions enforce the same transitions and write a `booking_events` row for each.
   - `draft` → `pending_payment` (hold) → `confirmed` (paid at least the deposit) → `completed` (nightly after the end date).
   - `pending_payment` → `expired` (hold lapsed) → `confirmed` only through a late payment that finds seats.
   - `quoted` → `pending_payment` → as above.
   - Any non-terminal status → `cancelled`.
   - `payment_state` follows `amount_paid`: `unpaid`, `deposit_paid`, `paid`, `partially_refunded`, `refunded`.
4. **Database functions** (all `security definer`, `set search_path = ''`, execute for `service_role` only, pgTAP for each). Migrations use the range `20261109100000`–`20261109199999`.
   - **Hold expiry at every read and write.** Each function first expires the booking's own overdue hold (`expire_booking_if_due(id)`).
   - **`next_booking_code()`** returns codes like `PTA-2611-0042`: the prefix, the Vietnam year and month of creation, then the sequence.
   - **`create_draft_booking(payload jsonb)`** writes the booking, its lines, the tour and cancellation-policy snapshots and the idempotency key, in one transaction. It is idempotent: the same key returns the existing booking. It takes no seats.
   - **`reserve_and_create_payment(booking_id, provider, kind)`**, for `kind` = `deposit` or `full`:
     - Takes a conditional seat update (`seats_reserved + n <= capacity` on an `open` or `guaranteed` departure), or raises `sold_out`. A `quoted` booking takes seats only when it has a `departure_id`; quotes for private tours without a departure take none.
     - Moves the booking to `pending_payment` and creates a `pending` payment whose `expires_at` equals `hold_expires_at`. Hold times come from `settings.booking_rules.hold_minutes` (30 min VNPay, 120 min transfer).
     - Switching method cancels the open payment and starts a new hold window from now, keeping the seats. At most 5 payment attempts per booking, so a hold cannot be extended forever.
     - Also accepts `quoted` bookings (4D), and `balance` payments for confirmed bookings (no seats taken).
   - **`record_payment_event(provider, event_key, payload, reference, amount, provider_txn_id, succeeded)`** is the only way a gateway result reaches the database:
     1. Inserts into `webhook_events` (unique per provider and event key). A repeat returns `duplicate` and changes nothing.
     2. Finds the payment by `reference`. With no match (for example a wrong transfer memo), it stores `error = 'unmatched'` for 4F.
     3. **Failed result:** a verified failed result (VNPay `vnp_ResponseCode` other than `00`) marks a `pending` payment `failed`. The booking stays `pending_payment` with its seats until the hold expires, so the customer can retry or switch method. Money is never recorded for a failed result.
     4. **Success for a `pending` payment:** the payment is recorded as `succeeded` with the amount actually received. A different amount sets `needs_attention` (`underpaid` or `overpaid`); the expected amount goes in the payment's `note`.
     5. **Success for a payment that is no longer `pending`:**
        - Covers the old VNPay attempt paid after a method switch cancelled it, a second transfer with the same memo, and a payment for a cancelled or expired booking.
        - Always inserts a **new** `payments` row for the amount received; a succeeded row is never overwritten. The new row's reference is the old one plus `-<n>`, and its note names the original attempt.
        - Adds the amount to `amount_paid` and sets `needs_attention`: `overpaid` when the attempt was already paid, `paid_after_switch` when it was cancelled by a method switch, `paid_after_cancel` when the booking is cancelled.
        - Never confirms a cancelled booking. An expired booking is handled by step 7.
     6. Updates `amount_paid` and `payment_state`, and confirms a `pending_payment` booking when paid ≥ deposit.
     7. A payment arriving after the booking expired tries to take the seats again. If none remain, it keeps the money, sets `needs_attention` (`late_payment_no_seats`) and leaves the booking `expired` (ADR-016).
   - **`confirm_payment()`** in `DATABASE.md` is this function; the docs are renamed in 4A.
   - **`expire_holds()`**: overdue `pending_payment` bookings → `expired`, seats released, open payments → `expired`. Scheduled with `pg_cron` every 5 minutes. A job only cleans up; correctness never depends on it.
   - **`cancel_booking(booking_id, actor_id, reason)`**: releases seats held or confirmed, sets `cancelled`, writes the event, and returns the refund the snapshot policy suggests. The refund itself is recorded in 4F.
   - **`complete_bookings()`**: nightly. Confirmed bookings whose end date has passed → `completed`.
   - **`check_seat_invariant()`**: nightly. For each departure, `seats_reserved` must equal the adults + children of its `pending_payment`, `confirmed` and `completed` bookings. Mismatches are written to `audit_logs` (`departures.seat_mismatch`) and raised as a warning for the `pg_cron` failure alert. It never "fixes" seats.
   - **`record_manual_payment(...)`** (4F): accountant or admin at aal2, called from the session client through a definer wrapper that checks `can_act_as('{accountant,admin}')`. A note is required. Used for cash and transfers with a wrong memo.
   - **`record_refund(booking_id, amount, provider, note)`** (4F), with the same definer wrapper and role check:
     - A note is required, and the amount must be above 0.
     - It never refunds more than `amount_paid` (already net of earlier refunds), so the total refunded never exceeds what was received.
     - It writes a `kind = 'refund'` row, subtracts the amount from `amount_paid` and recomputes `payment_state`.
5. **Payment references.** A reference is the booking code without dashes plus a 2-digit attempt number, for example `PTA2611004201`. It is a valid bank memo and the VNPay `vnp_TxnRef`. Bank-transfer matching looks for that exact token in the memo, ignoring case and spaces.
6. **Payment adapter** (`src/modules/payment/providers/*`). Each gateway implements `PaymentProvider` with `createPayment(payment) → { redirectUrl | qr }`, `verifyReturn(query)` (display only), `parseWebhook(request) → verified event | rejection` and `refund?()`.
   - **VNPay:** HMAC-SHA512 over the sorted, encoded params with `vnp_SecureHash`; amount × 100; `vnp_ExpireDate` = `expires_at` in GMT+7. The IPN:
     - checks the signature, then that `vnp_TmnCode` is ours, then that `vnp_Amount / 100` equals the payment's amount;
     - answers with VNPay's JSON: `97` bad signature, `01` order not found, `04` invalid amount, `02` already confirmed, `00` recorded;
     - records a signed IPN whose amount does not match through `record_payment_event` with the amount received, so it is flagged (`underpaid`/`overpaid`) and confirms only if the deposit is covered. It answers `04`.
   - **VietQR:** the EMVCo payload is built locally from `settings.bank_account` (BIN, account, amount, memo = reference) and rendered as an SVG QR on the server. The QR library is a dependency added in 4C with its own ADR.
   - **SePay/Casso:** API-key header check with a constant-time comparison; the payload is mapped to the event fields. Source IPs are restricted where the provider publishes them.
     - **Incoming credits only:** an event is mapped only when SePay sends `transferType = "in"`, or Casso sends `amount > 0`. Anything else (an outgoing refund that quotes the reference, a fee) is logged and ignored with a 200, so it can never count as a payment.
   - **Return pages** show "Đang chờ xác nhận thanh toán" and poll the booking status. They never confirm.
7. **Checkout access without an account.** Creating the draft sets a `booking_access` cookie: an HMAC (`BOOKING_ACCESS_SECRET`) of the booking id with a 7-day expiry, `httpOnly`, `secure` and `sameSite=lax`. The path is `/`, because the checkout paths are localized (`/thanh-toan/…`, `/en/checkout/…`); it is one cookie per booking (`booking_access_<code>`), and only checkout routes read it. Checkout pages need that cookie, or a signed-in customer who owns the booking, or (4E) a signed link token from the email. Knowing a booking code alone shows nothing. Guest lookup by code and email arrives in Phase 5.
8. **Guest writes** follow `ARCHITECTURE.md` "Data flow". A Server Action validates with Zod, checks Turnstile and rate limits, then calls the service, which uses the service role only inside `src/modules/booking`.
   - Rate limits use a fixed window on Upstash REST (the `src/lib/redis.ts` client; no new SDK): 10 draft creations and 10 payment starts per IP per 10 minutes, plus 5 payment starts per booking.
   - Every submit carries an idempotency key generated in the browser and stored with the draft.
   - **Payment start has no Turnstile** (accepted in the 4B review): Turnstile guards the draft, the only unauthenticated write that creates a row from nothing. Pay needs the booking's access cookie (or the owning customer), is limited per IP and per booking (5 per 10 minutes), and `reserve_and_create_payment` stops at 5 attempts (`too_many_attempts`), so a bot cannot hold seats at scale without first passing Turnstile once per booking.
   - **Failure modes:** rate limits fail **open**: if Upstash is unreachable or not configured, the request goes through and the miss is logged (`ratelimit.skipped`). Turnstile fails **closed** in production: a failed or unreachable check refuses the submit.
   - **What counts as production:** `VERCEL_ENV === "production"`, not `NODE_ENV` (Vercel previews run with `NODE_ENV=production`). Previews and CI use Cloudflare's test keys, and the env schema requires real Turnstile keys only when `VERCEL_ENV` is `production`. The same rule refuses `VNPAY_STUB`.
9. **Consent and terms.** Paying requires accepting the terms and the privacy policy. Each acceptance is written to `consent_records` with `document_version` = the page key and its `updated_at` (Phase 2 pages), and `bookings.terms_version` stores the same value. Marketing consent is a separate, unticked box.
10. **VAT invoice** details (company name, tax code validated as in settings, address, email) are optional at checkout. They are stored in `invoice_info` with `invoice_requested`; invoices are issued manually (ADR-016).
11. **Cache (Phase 3 decision 3).**
    - Cached tour cards stay free of seat counts.
    - The booking service calls `revalidateTag(tourTag(id))` and `revalidateTag("tours")` after a hold, confirmation or cancellation that changes whether a departure is bookable (sold out, or open again).
    - Holds that lapse through `pg_cron` cannot refresh the cache. A sold-out card can therefore lag for up to its `cacheLife("hours")`; the tour page's live section is always right. Recorded as accepted.
12. **CSP for checkout and account (ADR-027).**
    - These routes need a fully dynamic root layout with the proxy nonce. They sit under the shared `[locale]` root today, whose public pages must stay prerendered.
    - 4B therefore moves them into a route group with its own root layout: `src/app/(secure)/[locale]/(booking)/…`, beside `src/app/(public)/[locale]/…` for the cached site, each with its own `<html>`.
    - This is a cross-stream change to Stream B's tree. 4B starts with that move as its own commit, agreed with the coordinator, or a spike first if Next.js refuses two `[locale]` roots.
13. **Entry from the tour page.** When `features.booking` is on, PR H's `BookingBox` button goes to `/dat-tour/[tourSlug]?departure=<id>&adults=<n>&children=<n>` (`/en/book/…`). The booking page validates every parameter and falls back to the first bookable departure. Switching the flag on is part of 4B's last step, with Stream B's agreement.
14. **Emails (4E)** use React Email templates in `emails/`, in the booking's locale. They are sent after the database commit, logged in `email_logs`, and their failures never roll back a booking:
    - booking received;
    - payment received;
    - booking confirmed;
    - payment link;
    - balance reminder (Phase 5 scheduling);
    - cancelled;
    - a staff alert for "needs attention".
15. **Monitoring.** IPN and webhook failures (bad signature, unmatched, amount mismatch) go to Sentry with the booking code and never the payload's card data. `check_seat_invariant` warnings and failed `pg_cron` runs are covered by `ARCHITECTURE.md` "Monitoring". Runbooks for unconfirmed payments and the queue go in `README.md` (4F).
16. **Passenger data.** Travellers are optional before payment ("can be completed later"). No passport numbers (ADR-016). Dates of birth are checked against the child and infant age limits at departure as warnings for sales, not blocks.

## Cross-stream items

- **Cache:** booking functions refresh `tours` and `tour:<id>` (decision 11). Stream B keeps cached cards free of seat counts.
- **CSP and the route-group move:** checkout and account get their own root layout (decision 12).
  - **Owner:** Stream B. A standalone, mechanical PR (`git mv src/app/[locale]/… src/app/(public)/[locale]/…`, no other changes) lands after one of Stream B's PRs and before 4B.
  - **Stream A's part:** a throwaway spike during 4A that checks three things and reports them in the 4A PR:
    1. Next.js 16 accepts two root layouts with a `[locale]` segment in sibling groups;
    2. the public `[...rest]` catch-all does not swallow the localized checkout paths under next-intl's rewrites;
    3. each root has its own not-found page.
  - 4B then only adds the `(secure)` tree.
- **Booking box:** PR H's `BookingBox` becomes the entry to 4B (decision 13). The URL contract above is fixed now so Stream B can link to it.
- **`settings.booking_rules`** keeps its shape. Phase 4 reads `hold_minutes`, `balance_reminder_days_before_due`, `booking_lookup_link_minutes` and `booking_cutoff_days` (via `booking_cutoff_days()`). It adds nothing without the settings editor (Stream A owns `settings.schemas.ts`).

## Steps

One pull request per group, one commit per step. Every function and policy gets pgTAP; every service gets unit tests; every money flow gets E2E.

### PR 4A — Booking core (database and domain)

1. `pricing.ts` and `state-machine.ts` with unit tests: party rules, deposit rounding, plans, child and infant prices, single rooms, `price_changed`, every allowed and refused transition.
2. Migration `*_booking_functions.sql`: `next_booking_code()`, `expire_booking_if_due()`, `create_draft_booking()`, `reserve_and_create_payment()`, `record_payment_event()`, `expire_holds()`, `cancel_booking()`, `complete_bookings()`, `check_seat_invariant()`, and a `booking_events` row for each transition. pgTAP covers:
   - draft idempotency;
   - holds and `sold_out`, and a quoted booking without a departure holding no seats;
   - method switch and the attempt limit;
   - `price_changed`;
   - deposit and full confirmation;
   - repeated IPN → `duplicate` with one payment;
   - a verified failed result → payment `failed`, booking still `pending_payment` with its seats;
   - underpaid and overpaid;
   - success for a cancelled attempt after a method switch → a new payment row, `paid_after_switch`;
   - a second success for an attempt already paid → a new row, `overpaid`, the first row unchanged;
   - success for a cancelled booking → a new row, `paid_after_cancel`, the booking stays cancelled;
   - unmatched references;
   - late payment with and without seats;
   - expiry releasing seats;
   - cancellation releasing seats;
   - the invariant after a mixed sequence;
   - no execute for anon, authenticated and staff.
3. Migration `*_booking_cron.sql`: `pg_cron` schedules for `expire_holds` (every 5 minutes), `complete_bookings` and `check_seat_invariant` (nightly, Vietnam time). They are skipped with a notice where `cron` is unavailable (local shim).
4. `src/modules/booking/booking.service.ts` and `booking.repository.ts` (service role, server only):
   - `startDraft`, `quote`, `startPayment` and `cancel`;
   - error mapping for `sold_out`, `price_changed`, `too_many_attempts` and `expired`;
   - the cache refresh of decision 11.
   Unit tests.
5. Race and idempotency test `tests/e2e/booking-core.spec.ts`, which uses no browser. It calls the functions concurrently through PostgREST with the service role (`Promise.all`):
   - two customers on the last seat → one hold and one `sold_out`;
   - ten concurrent copies of one IPN → one payment, nine `duplicate`;
   - the seat invariant holds at the end.
   Also the `DATABASE.md` function table, and ADR-033 if a decision changes during the work.

### PR 4B — Book-now flow

6. Route group move for the secure root layout (decision 12), with Stream B's agreement. The nonce CSP applies to the new root; E2E checks for no `securitypolicyviolation`.
7. `/dat-tour/[tourSlug]` (`/en/book/…`): departure, travellers and single rooms, contact details, travellers (optional), plan and invoice details, then terms and pay, in at most 4 steps. The price comes from the server at every step. React Hook Form + Zod, Turnstile, idempotency key. The `booking_access` cookie is set at draft creation.
   - **As built (4B):** three steps (date and guests; contact; plan, VAT invoice and terms). Traveller details are not asked in this flow: they are optional before payment ("can be completed later", decision 16) and are collected later, by sales in the admin or by the customer in the account area (Phase 5). The consent is recorded with the draft in one transaction (`create_checkout_draft()`), for published pages only (the privacy policy is required; the terms are recorded when a terms page is published).
   - A draft whose departure price changed before Pay is repriced on the server from the booking row (`repriceStaleDraft()`); the customer sees the new total and pays again.
8. `/thanh-toan/[code]` with `…/phuong-thuc` and `…/ket-qua`: summary, a real hold countdown, method choice, the "waiting for confirmation" result page polling the status, and the expired state with "chọn lại ngày". Components: BookingStepper, PaxSelector, PriceBreakdown, ContactForm, TravellerForm, PaymentPlanSelector, PaymentMethodSelector, HoldCountdown, PaymentResult, BookingSummaryCard, InvoiceInfoForm, CancellationPolicySummary, TermsConsent.
9. `messages/{vi,en}/public-booking.json`; `features.booking` on. E2E: book a group tour through the VNPay stub (`booking-flow.spec.ts`), with axe at 375 and 1280 px.

### PR 4C — Gateways

10. VNPay adapter with unit tests on VNPay's published test vectors; `/api/payments/vnpay/ipn` (verify, `record_payment_event`, `RspCode`); return route; the CI stub.
11. VietQR: payload builder (unit-tested), the QR SVG with an ADR for the library, a VietQRPanel with the memo, amount and copy buttons.
12. `/api/webhooks/bank-transfer` for SePay/Casso: key check, mapping, the source-IP list. E2E with signed test payloads covering underpaid, overpaid, wrong memo, late payment, a second transfer with the same memo, a transfer for a cancelled booking, and an outgoing transfer quoting the reference (ignored, nothing recorded). VNPay IPN E2E: wrong `vnp_TmnCode`, amount mismatch (`04`, flagged), repeated IPN (`02`), failed result, and the old attempt paid after a method switch.

### PR 4D — Private-tour quotes and payment links

13. Admin: from an inquiry, sales creates a `quoted` booking (final price lines, quote expiry) through `create_quote()` (definer, sales/sales_manager/admin via `can_act_as`).
14. Payment links: `payment_links` rows with a hashed token, expiry and single use; `/thanh-toan/link/[token]` (`/en/pay/[token]`) leads into the standard payment step; balance payments use the same link. pgTAP and E2E.

### PR 4E — Emails

15. React Email brand layout and the templates of decision 14, the Resend client with the `skipped` mode, `email_logs`, links signed for checkout access, and a staff alert for the queue. Unit tests render each template in both languages.

### PR 4F — Admin bookings and payments

16. `/admin/bookings`: list filtered by status, departure, tour and owner; detail with lines, travellers, payments and the event timeline; edit contact details and travellers; cancel with the suggested refund (`cancel_booking`); resend emails; manual bookings for phone customers through the same functions.
17. `/admin/payments`: ledger by gateway and status; manual recording with a required note (`record_manual_payment`, accountant/admin at aal2); refunds recorded as `kind = 'refund'` rows (`record_refund`); unmatched transfers assigned to a booking.
18. "Needs attention" queue: late payments, underpaid and overpaid, unmatched, overdue balances, bookings on cancelled departures; resolve with a note. Dashboard counts for each role. Runbooks in `README.md`. E2E per role.

## Acceptance criteria

- [ ] E2E booking with a sandbox (stub) payment passes: draft → hold → signed IPN → confirmed, with emails logged
- [ ] Two customers booking the last seat → exactly one hold succeeds (concurrent test)
- [ ] A repeated IPN or webhook creates no duplicate payment and no second confirmation
- [ ] A success for a payment that is no longer pending adds a new payment row and flags the booking; it never overwrites a succeeded row or confirms a cancelled booking
- [ ] Bank webhooks count incoming credits only
- [ ] A late IPN is handled on both branches: seats free → confirmed; no seats → money kept, `needs_attention`, staff alerted
- [ ] The seat invariant holds after the full test run (`check_seat_invariant()` reports nothing)
- [ ] Prices are never taken from the browser; a price change between draft and payment is shown before paying
- [ ] No payment is confirmed without a verified signature, or a manual record by an MFA-verified accountant or admin with a note
- [ ] Checkout pages need the access cookie, the owning customer's session or a signed link; a booking code alone shows nothing
- [ ] Holds expire on read and by `pg_cron`; seats come back; the countdown matches `hold_expires_at`
- [ ] Booking and payment functions are callable by `service_role` only (or role-checked wrappers); pgTAP for each
- [ ] Checkout and account have the nonce CSP with no violations; public pages stay prerendered
- [ ] Staff see and act on bookings and payments per the `ARCHITECTURE.md` matrix; RLS and per-role E2E
- [ ] Lint, typecheck, unit, pgTAP, E2E green in CI

## Before go-live (owner accounts needed; no code yet)

Found in the 4C review. Each needs a real gateway or bank-webhook account, so it is checked on staging before production:

- **VNPay empty values:** check how the signature treats `vnp_*` parameters with empty values against real sandbox IPNs for a cancelled payment and a failed one, and add both as test vectors in `providers/vnpay.test.ts`.
- **Webhook source IPs:** add the source-IP allow-list that SePay or Casso publishes to `/api/webhooks/bank-transfer` (and VNPay's to the IPN route), configured by env.
- **Casso signature:** check whether Casso's current webhooks sign with `X-Casso-Signature` (HMAC) instead of the `secure-token` header, and switch `authorized()` if so.
- **`VNPAY_STUB`:** never set on a staging or preview that holds real-looking data (`README.md`).

## Out of scope

Balance reminder scheduling, booking lookup by code and email, customer accounts and attaching earlier bookings (Phase 5). MoMo, international cards, coupons, add-ons, date changes, PDF vouchers and quotes, and e-invoice integration (P1). Automatic refunds through the gateway (the adapter's optional `refund()` stays unimplemented until a contract allows it).

## Handover prompt

```text
Read CLAUDE.md, the docs it imports and docs/specs/phase-4-booking-payments.md. Implement the next
PR of the Phase 4 spec, one step per commit, following the decisions and the stream rules. Seats
and money change only in the Postgres functions; never confirm a payment without a verified
signature. Run lint, tsc, unit tests, pgTAP and the production build before each push. Open the PR
with an acceptance table, deviations and what is blocked by missing accounts.
```
