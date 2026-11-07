# Premium Travel Agency

Bilingual (Vietnamese/English) website and admin for a premium travel agency: tour catalog, online booking and payment, tailor-made trip inquiries, customer accounts and a role-based admin.

- Stack: Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 3, shadcn/ui, Supabase (Postgres, RLS, Auth with TOTP MFA, Storage), next-intl, Sentry.
- Project rules for contributors and Claude Code: [`CLAUDE.md`](CLAUDE.md).
- Design and decisions: [`docs/`](docs/) — start with [`PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md), [`ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`DATABASE.md`](docs/DATABASE.md) and [`DECISIONS.md`](docs/DECISIONS.md). Current status: [`PROGRESS.md`](docs/PROGRESS.md).

## Local setup

Requirements: Node.js 22, npm, and Docker (for the local Supabase stack).

```bash
npm ci
npx supabase start          # local Postgres, Auth, REST and Storage; applies migrations + seed
npx supabase status -o env  # prints the local URL and keys used below
cp .env.example .env.local  # then fill in the values (see the table below)
npm run seed:users          # one sample account per role: <role>@example.test (needs SEED_USER_PASSWORD)
npm run dev                 # http://localhost:3000
```

- Public site: `/` (Vietnamese) and `/en` (English).
- Staff sign-in: `/auth/login`, then `/admin`. Admin and accountant must enrol TOTP MFA at `/admin/mfa` on first sign-in.
- Local email (sign-up confirmations, password resets) is captured by the Supabase CLI's mail viewer; see `npx supabase status`.

The server validates every environment variable at startup (`src/lib/env/`) and refuses to start with a missing or wrong value, naming the variable but never printing its value.

## Commands

```bash
npm run dev            # dev server
npm run build          # production build
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # Vitest unit tests
npm run test:e2e       # Playwright against a production build (see "End-to-end tests" below)
npx supabase db reset  # re-apply migrations + seed
npx supabase test db   # pgTAP tests
npx supabase db lint   # schema lint
npm run db:types       # regenerate src/types/database.types.ts after a migration
```

## End-to-end tests

`npm run test:e2e` starts `npm run start`, so build first, with local Supabase running and the sample users seeded:

```bash
npm run build
SEED_USER_PASSWORD=... \
E2E_SUPABASE_URL=http://127.0.0.1:54321 \
E2E_SUPABASE_SECRET_KEY=<SERVICE_ROLE_KEY from npx supabase status -o env> \
npm run test:e2e
```

`E2E_SUPABASE_*` are used only by the tests (to create email-link tokens), never by the app. The browser-monitoring test runs only when the build has a `NEXT_PUBLIC_SENTRY_DSN` (CI uses a fake one) and intercepts the requests it triggers. CI runs all of this on every pull request.

## Environment variables

Never commit real values. `.env.example` lists every variable; `.env.local` is git-ignored. In Vercel, set each variable per environment (Preview uses the staging Supabase project until production exists).

| Variable | Scope | Where the value comes from | Where to set it |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | The site's base URL (`http://localhost:3000` locally) | `.env.local`; Vercel Production (domain) and Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Local: `API_URL` from `npx supabase status -o env`. Hosted: Supabase dashboard → Project Settings → API | `.env.local`; Vercel |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Local: `PUBLISHABLE_KEY` (or `ANON_KEY`). Hosted: Supabase → API keys → publishable key | `.env.local`; Vercel |
| `SUPABASE_SECRET_KEY` | **server only** | Local: `SERVICE_ROLE_KEY` (or `SECRET_KEY`). Hosted: Supabase → API keys → secret key. Bypasses RLS | `.env.local`; Vercel (never `NEXT_PUBLIC_`) |
| `GOOGLE_OAUTH_ENABLED` | server | `true` only after the Google provider is configured in Supabase Auth | `.env.local`; Vercel |
| `SHOW_DESIGN_SYSTEM` | server | `true` serves the staff-only `/admin/design-system` page in a production build (always on in development) | CI only; optionally Vercel Preview. **Never** Vercel Production |
| `RESEND_API_KEY`, `EMAIL_FROM` | server | Resend dashboard (Phase 4); also configured as Supabase Auth SMTP in the Supabase dashboard | Vercel |
| `SENTRY_DSN` | server | Sentry → project settings → Client Keys (DSN) | Vercel |
| `NEXT_PUBLIC_SENTRY_DSN` | public | Same DSN (it is designed to be public) | Vercel |
| `CRON_SECRET` | server | Generate (at least 16 random characters); used by Vercel Cron routes (Phase 4) | Vercel |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | server | Upstash console > Redis database > REST API (https URL and token). Optional until the account exists: redirect sync is skipped and logged without them; required in production from Phase 3 | Vercel |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_PAYMENT_URL` | server | VNPay merchant portal (sandbox keys first; production after the merchant contract). Without both keys the VNPay method is hidden and the IPN answers 97. `VNPAY_PAYMENT_URL` defaults to the sandbox | Vercel (production keys only in Production) |
| `VNPAY_STUB` | server | CI only: replaces VNPay's payment page with `/api/payments/vnpay/stub`, which signs its IPN with `VNPAY_HASH_SECRET`. Refused when `VERCEL_ENV=production`. Keep it off on any staging or preview that holds real-looking data: anyone holding a signed payment URL could confirm that payment there | GitHub Actions |
| `BANK_WEBHOOK_PROVIDER`, `BANK_WEBHOOK_SECRET` | server | `sepay` (API key, sent as `Authorization: Apikey …`) or `casso` (secure token). Without both the webhook answers 503 and transfers wait for an accountant | Vercel |
| `BOOKING_ACCESS_SECRET` | server | 32+ random characters (`openssl rand -base64 48`). Signs the `booking_access_<code>` cookie that lets a guest reopen their checkout; without it the booking page shows the hotline instead of the booking form | Vercel, GitHub Actions |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | build only | Sentry → organization auth token (scope: project releases) | Vercel (build); leave empty locally |
| `SEED_USER_PASSWORD` | local tool | Choose one (at least 12 characters) for `npm run seed:users` | `.env.local` only |

Sentry is off whenever no DSN is set, so local development sends nothing (CI builds the browser SDK with a fake DSN and intercepts it). Collection is minimised in `src/lib/monitoring/sentry-options.ts`: no IPs, user details, cookies, request bodies, query strings or credential headers, payment-link tokens redacted from URLs, and no performance tracing (errors only). Once deployed, an MFA-verified admin can send `POST /api/monitoring/test-error` (for example `fetch("/api/monitoring/test-error", { method: "POST" })` in the browser console while signed in) to confirm that errors reach Sentry.

## Deployment (Vercel + Supabase, Singapore)

Owner setup, once (ADR-018):

1. **Supabase**: create the staging project (Singapore). Link it with `npx supabase link --project-ref <ref>` and apply migrations with `npx supabase db push`. In Auth settings: turn **"Confirm email" on** (with it off, Supabase auto-confirms every address at sign-up; the site then refuses customer sign-up and never attaches earlier bookings to an account, ADR-037) and "Secure email change" on, enable TOTP MFA, set the site URL, add the redirect URLs `https://<host>/auth/confirm` and `https://<host>/auth/callback` for each fixed host, add a wildcard for Vercel previews (for example `https://*-<team-slug>.vercel.app/**`, since preview hosts change on every deployment), and configure Resend as SMTP. Transactional emails (ADR-036) are written to `email_logs` as `skipped` until `RESEND_API_KEY` and `EMAIL_FROM` are set; those emails are never sent later on their own, because their exactly-once keys are already spent. After configuring Resend, resend any that still matter from the booking page. Under Authentication > Email Templates > Invite user, paste `supabase/templates/invite.html` (staff invitations link to `/auth/confirm` with a token hash, ADR-032); without SMTP and this template, inviting staff from `/admin/staff` fails.
2. **Sentry**: create a Next.js project; note the DSN, org and project slugs; create an auth token for source maps.
3. **Vercel**: import the GitHub repository (framework preset Next.js, region `sin1`). Add the variables above for Preview and Production. Every pull request then gets a preview URL; `main` deploys to production once a production Supabase project exists.
4. **GitHub**: enable branch protection on `main`, requiring the CI checks (`Lint, typecheck, unit tests`, `Database (migrations, pgTAP, lint, types)`, `Build and E2E`).

Staging data: `npm run seed:users -- --allow-remote=<project-host>` creates the sample staff accounts on a non-production project. Never run it against production.

## Runbooks (bookings and payments)

Money is confirmed only by a verified gateway result or recorded by an MFA-verified accountant or admin with a note (ADR-012). Every manual step below writes a payment row, a booking event and an `audit_logs` row naming the staff member.

- **A customer says they paid, but the booking is still waiting.** Open the booking in `/admin/bookings`. VNPay: look the transaction up in the VNPay merchant portal; if it succeeded there, the IPN failed. Check Sentry for `payment.vnpay_*` errors, then record the payment with method "Khác (ghi tay)" and the VNPay transaction number in the note. Bank transfer: first look for it under "Chuyển khoản chưa khớp" in `/admin/payments`, because a wrong memo lands there. If it is not there, check the bank statement and record it as "Chuyển khoản" with the bank's reference in the note.
- **Unmatched transfer** (`/admin/payments`, accountant or admin): find the booking (code in the customer's receipt, amount, date), enter its code and a note, and press "Gán". The amount comes from the bank webhook, never from the form, and a transfer can be assigned once.
- **"Needs attention" queue** (`/admin/bookings/attention`, oldest first):
  - Underpaid: ask the customer for the rest. Record it when it arrives, or refund the partial amount and cancel.
  - Overpaid, or paid twice: refund the extra (`Hoàn tiền`, at most what was received).
  - Paid an attempt that was replaced, failed or expired: if the booking is confirmed, the money counts towards it; refund anything above the total.
  - Paid after cancellation (also set when cash is recorded for a cancelled booking): refund in full.
  - Late payment, no seats: offer another departure (cancel this booking and book the new one by hand in Phase 4 PR 4D), or refund.
  - Cancellation requested: an operator cancels. The page shows the refund suggested by the policy; the accountant records the refund after paying it.
  - Balance overdue: remind the customer. Bookings are never cancelled automatically (ADR-016). This item clears when the balance is paid or the booking is cancelled.
  - Departure cancelled: contact the customer, then cancel with a full refund or move them.
  - Paid a quote (`paid_quoted`) or a draft: money recorded for a booking with no hold never confirms it. Send the customer a payment link (Phase 4 PR 4D) or start a hold first, then refund or move the money.
  - When done, write what was done in "Đánh dấu đã xử lý". Money reasons are cleared by an MFA-verified accountant or admin, a cancellation request by an operator or admin. A cancellation requested while a money reason was open comes back to the operators once the money is resolved. Derived items (overdue balance, cancelled departure) clear on their own.
- **Emails stuck or failed** (the `email-problems-alert` pg_cron job fails when an email stays `queued` for over 10 minutes or one `failed` in the last 15). Find them in the SQL editor:

  ```sql
  select created_at, template, status, error, booking_id, dedupe_key
    from email_logs
   where (status = 'queued' and created_at < now() - interval '10 minutes')
      or (status = 'failed' and created_at > now() - interval '1 day')
   order by created_at desc;
  ```

  `error` holds only an HTTP status or an error class (`HTTP 401`: wrong `RESEND_API_KEY`; `HTTP 403`: the sending domain is not verified; `HTTP 422`: a bad address; `TimeoutError` or `TypeError`: Resend unreachable). A `queued` row means the sender stopped between claiming the email and Resend's answer: check Resend's dashboard for the message before sending again. Fix the cause, then open the booking and press "Gửi lại" next to the email (sales roles and admin). A resend gets a fresh key and appears in the timeline; payment links are never resent (their token is not stored), so create a new link instead.
- **Refund:** pay the customer first, by bank transfer or cash, or refund in the VNPay portal. Then record it on the booking. The form refuses more than the amount received, net of earlier refunds.

## Workflow

Work happens on short-lived branches with one commit per spec step, merged through pull requests after CI and an independent review (ADR-020). See [`CLAUDE.md`](CLAUDE.md).
