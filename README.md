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
npm run seed:media          # placeholder images for the seed's tour heroes and journal covers
                            # or: npm run seed:media -- --photos  (real free photos, needs internet)
npm run dev                 # http://localhost:3000
```

`npm run seed` runs both seeding steps. `seed:media` fills in the files behind the seed's `Sample image` media rows, which `seed.sql` can only insert as rows: it draws a landscape in the brand palette with sharp (no network, nothing committed), uploads it to the `media` bucket and sets the row's size and blur placeholder. It skips files that already exist, so it is safe to re-run, and it is local-only like `seed:users` (`--allow-remote=<host>` for a staging project, never with `VERCEL_ENV=production`). The images are generated placeholders: real photos go in through `/admin/media`. CI does not run it, so its E2E and axe checks see the empty image frames.

`npm run seed:media -- --photos` uses real photos instead: eighteen free Unsplash photos listed with their photographer and licence in `scripts/lib/seed-photos.ts` (no image is committed). It needs internet access. Each photo is downloaded once into memory from an https allow-list of image hosts (20 s and 20 MB at most), checked like an admin upload (real type JPEG or WebP, size and pixel limits), re-encoded to the row's 2400 × 1600 JPEG without metadata, and credited on the row as `Photo: <photographer> / Unsplash`. It also replaces the drawings an earlier run left, once a photo is in hand. A photo that cannot be used (offline, a moved photo, a refused redirect) falls back to the drawing for that row and keeps the `Sample image` credit, so running `--photos` again retries it; the run prints counts and the keys of the photos it could not use. The photos are for local development and demos only: for production the owner uploads their own photography through `/admin/media`.

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
node scripts/check-audit.mjs  # npm audit of production dependencies (CI "Security scans")
```

CI's "Security scans" job also runs gitleaks over the whole git history. A finding fails it; a verified test fixture is ignored by its exact fingerprint in `.gitleaksignore`, a real secret is revoked and replaced at its provider first (then in Vercel), and only then removed from the history. A high or critical `npm audit` advisory is fixed, or accepted in `scripts/audit-accepted.json` with a reason and an expiry and listed in `docs/SECURITY_REVIEW.md`.

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

Never commit real values. `.env.example` lists every variable; `.env.local` is git-ignored. In Vercel, set each variable per environment: Production gets production values only, Preview gets staging values only (the staging Supabase project and Upstash database, VNPay sandbox keys, staging secrets) and never a production secret. The server checks this at start and in every Vercel build (`STAGING_HOSTS`, `PRODUCTION_HOSTS` below); values it cannot recognise by host (`CRON_SECRET`, `BOOKING_ACCESS_SECRET`, the bank webhook key, the Resend key) rely on Vercel's per-environment scoping, so generate a different value for each environment and check every environment's list before launch (launch checklist).

| Variable | Scope | Where the value comes from | Where to set it |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | The site's base URL (`http://localhost:3000` locally) | `.env.local`; Vercel Production (domain) and Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Local: `API_URL` from `npx supabase status -o env`. Hosted: Supabase dashboard → Project Settings → API | `.env.local`; Vercel |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Local: `PUBLISHABLE_KEY` (or `ANON_KEY`). Hosted: Supabase → API keys → publishable key | `.env.local`; Vercel |
| `SUPABASE_SECRET_KEY` | **server only** | Local: `SERVICE_ROLE_KEY` (or `SECRET_KEY`). Hosted: Supabase → API keys → secret key. Bypasses RLS | `.env.local`; Vercel (never `NEXT_PUBLIC_`) |
| `GOOGLE_OAUTH_ENABLED` | server | `true` only after the Google provider is configured in Supabase Auth (Client ID and secret from the owner's Google Cloud OAuth client; redirect URL `https://<project>.supabase.co/auth/v1/callback`); shows "Continue with Google" and opens `/auth/callback` (ADR-037 calls it `AUTH_GOOGLE_ENABLED`; see the Phase 5 spec's "As shipped") | `.env.local`; Vercel |
| `SHOW_DESIGN_SYSTEM` | server | `true` serves the staff-only `/admin/design-system` page in a production build (always on in development). Refused when `VERCEL_ENV=production` | CI only; optionally Vercel Preview. **Never** Vercel Production |
| `RESEND_API_KEY`, `EMAIL_FROM` | server | Resend dashboard (Phase 4); also configured as Supabase Auth SMTP in the Supabase dashboard | Vercel |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | public (build time) | Google Analytics → Admin → Data streams → Web → Measurement ID (`G-…`, owner item 10). Optional: without it nothing of Google's loads and the CSP allows no Google host. With it, gtag.js loads only after a visitor grants "analytics" (ADR-039). In the GA4 data stream, **turn Enhanced measurement off** (it would send page views and clicks with the real URL, which can hold booking codes) and leave "Google signals" off unless the privacy policy covers it | Vercel Production only (previews and CI use none or a fake ID) |
| `SENTRY_DSN` | server | Sentry → project settings → Client Keys (DSN) | Vercel |
| `NEXT_PUBLIC_SENTRY_DSN` | public | Same DSN (it is designed to be public) | Vercel |
| `CRON_SECRET` | server | 32+ random characters (`openssl rand -base64 48`). Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>` to `/api/cron/*`; without it those routes answer 503 and nothing runs. Required when `VERCEL_ENV=production` | Vercel, GitHub Actions (a CI-only value) |
| `CRON_HEARTBEAT_URL` | server | Optional: the heartbeat URL of the owner's uptime monitor (https; `{job}` in it becomes the job name, for one monitor per job). Pinged after every successful `/api/cron/*` run, so a stopped Vercel Cron alerts (Phase 6 PR 6B). Treat it as a secret (it carries the monitor's token) | Vercel Production |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | server | Upstash console > Redis database > REST API (https URL and token). Optional until the account exists: redirect sync is skipped and logged without them; required in production from Phase 3 | Vercel |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_PAYMENT_URL` | server | VNPay merchant portal (sandbox keys first; production after the merchant contract). Without both keys the VNPay method is hidden and the IPN answers 97. `VNPAY_PAYMENT_URL` defaults to the sandbox | Vercel (production keys only in Production) |
| `VNPAY_STUB` | server | CI only: replaces VNPay's payment page with `/api/payments/vnpay/stub`, which signs its IPN with `VNPAY_HASH_SECRET`. Refused when `VERCEL_ENV=production`. Keep it off on any staging or preview that holds real-looking data: anyone holding a signed payment URL could confirm that payment there | GitHub Actions |
| `BANK_WEBHOOK_PROVIDER`, `BANK_WEBHOOK_SECRET` | server | `sepay` (API key, sent as `Authorization: Apikey …`) or `casso` (secure token). Without both the webhook answers 503 and transfers wait for an accountant | Vercel |
| `VNPAY_IPN_ALLOWED_IPS`, `BANK_WEBHOOK_ALLOWED_IPS` | server | Source allow-lists of the two webhooks (Phase 6 decision 2): comma-separated IPv4/IPv6 addresses or CIDR ranges (at least /8 for IPv4 and /16 for IPv6, no host bits), matched against the first `x-forwarded-for` hop, which Vercel sets. Empty means not enforced; required in production while the gateway is configured. VNPay: the IPN addresses VNPay gives with the merchant contract (owner item 8). SePay: its published list, https://developer.sepay.vn/en/dia-chi-ip (2026-11-07: `172.236.138.20, 172.233.83.68, 171.244.35.2, 151.158.108.68, 151.158.109.79, 103.255.238.139, 45.57.137.67, 2400:8905::2000:8cff:fe98:45cd, 2600:3c15::2000:8aff:fedd:874b`; re-check before go-live, SePay says it may change). Casso publishes none: set `unrestricted`, the accepted exception in `docs/SECURITY_REVIEW.md`, and the key stays the only guard. A refused call gets 403 and is logged; one that carries a valid signature or key is a Sentry error (`payment.webhook_source_refused`), at most once per provider per 15 minutes: the provider's addresses may have changed, so check before updating the list | Vercel (Production; previews may leave them empty) |
| `BOOKING_ACCESS_SECRET` | server | 32+ random characters (`openssl rand -base64 48`). Signs the `booking_access_<code>` cookie that lets a guest reopen their checkout; without it the booking page shows the hotline instead of the booking form | Vercel, GitHub Actions |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | build only | Sentry → organization auth token (scope: project releases). With the token, each Vercel build creates a Sentry release named after its commit (`VERCEL_GIT_COMMIT_SHA`) and uploads its source maps | Vercel (build); leave empty locally |
| `SENTRY_RELEASE` | server, build | Optional override of the release name (default: `VERCEL_GIT_COMMIT_SHA`, which Vercel sets; expose system environment variables in the Vercel project so the browser gets `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` too) | Vercel, rarely |
| `SEED_USER_PASSWORD` | local tool | Choose one (at least 12 characters) for `npm run seed:users`. Any `SEED_*` or `E2E_*` variable stops a production server from starting | `.env.local` only |
| `STAGING_HOSTS`, `PRODUCTION_HOSTS` | server | Deployment guards (Phase 6 decision 11, `src/lib/env/deployment.ts`): comma-separated host names, no scheme. `STAGING_HOSTS`: the staging Supabase host (`<staging ref>.supabase.co`), the staging Upstash host and any staging site host. `PRODUCTION_HOSTS`: the production Supabase host, the production Upstash host and the production domain(s). Production refuses to start without both lists, on any staging host, or with a Supabase or Upstash host that is not in `PRODUCTION_HOSTS`; a preview refuses every production host. Production also refuses `SHOW_DESIGN_SYSTEM=true`, `VNPAY_STUB`, CI's fake GA4 ID (`G-E2ETEST000`), Cloudflare's Turnstile test keys, VNPay keys with the sandbox gateway and a non-https site URL; a preview refuses VNPay's production gateway; and every environment refuses a legacy JWT key of another project than its URL. Not secret | Vercel, **all environments** (Production and Preview, the same values), so a variable copied to the wrong environment is caught |

Sentry is off whenever no DSN is set, so local development sends nothing (CI builds the browser SDK with a fake DSN and intercepts it). Collection is minimised in `src/lib/monitoring/sentry-options.ts`: no IPs, user details, cookies, request bodies, query strings or credential headers, payment-link tokens redacted from URLs, and no performance tracing (errors only). Once deployed, an MFA-verified admin can send `POST /api/monitoring/test-error` (for example `fetch("/api/monitoring/test-error", { method: "POST" })` in the browser console while signed in) to confirm that errors reach Sentry.

## Deployment (Vercel + Supabase, Singapore)

Owner setup, once (ADR-018):

1. **Supabase**: create the staging project (Singapore), and later the production project (Singapore, with the **PITR add-on**). Migrations reach both only through the "Database migrations" workflow (step 5), never from a developer machine; production gets no seed (migrations, then `settings` through the admin). In Auth settings: turn **"Confirm email" on** (with it off, Supabase auto-confirms every address at sign-up; the site then refuses customer sign-up and never attaches earlier bookings to an account, ADR-037) and "Secure email change" on, enable TOTP MFA, set the site URL, add the redirect URLs `https://<host>/auth/confirm` and `https://<host>/auth/callback` for each fixed host, add a wildcard for Vercel previews (for example `https://*-<team-slug>.vercel.app/**`, since preview hosts change on every deployment), and configure Resend as SMTP. Transactional emails (ADR-036) are written to `email_logs` as `skipped` until `RESEND_API_KEY` and `EMAIL_FROM` are set; those emails are never sent later on their own, because their exactly-once keys are already spent. After configuring Resend, resend any that still matter from the booking page. Under Authentication > Email Templates > Invite user, paste `supabase/templates/invite.html` (staff invitations link to `/auth/confirm` with a token hash, ADR-032); without SMTP and this template, inviting staff from `/admin/staff` fails. Customer accounts (Phase 5) need three more templates, each bilingual on the account's language: Confirm signup (`supabase/templates/confirmation.html`), Reset password (`recovery.html`) and Change email address (`email_change.html`). Set the minimum password length to 10, turn on leaked-password protection, and under Rate limits use the values in `supabase/config.toml` `[auth.rate_limit]` (300 sign-ins and sign-ups and 1 800 token refreshes per 5 minutes per IP): Supabase sees only the Vercel functions' IPs, so the defaults would throttle every customer together; the app's per-email limits are the real guard. For Google sign-in, enable the provider with the owner's OAuth client and set `GOOGLE_OAUTH_ENABLED=true`.
2. **Sentry**: create a Next.js project; note the DSN, org and project slugs; create an auth token for source maps and releases. Then add the alert rules (Alerts → Create alert; owner item 7, they need the account):
   - **New issue**: "A new issue is created" in production → email the on-call person.
   - **Spike**: "The issue is seen more than 50 times in 1 hour" (or Sentry's spike protection alert) → email and SMS/phone.
   - **Payments**: "The event's tags match `payment.webhook` (is set)" → immediately. The IPN and webhook handlers send an event for each problem, tagged `payment.webhook` (the provider) and `payment.event`: errors for `payment.vnpay_ipn_unconfigured` and `payment.record_failed`; warnings for `payment.needs_attention` and `payment.bank_transfer_unmatched`; and warnings sampled at 10 % for `payment.vnpay_bad_signature` and `payment.bank_webhook_unauthorized`, which anyone can send repeatedly (every one is still logged; the 6A source-IP allow-lists will stop them first). Events carry no reference, amount or payload.
   - **Scheduled jobs**: "An event's tags match `cron.kind` is set" (the health check reports every failed or missed pg_cron run with tags `cron.job` and `cron.kind`) → email.
   - **Cron Monitors**: every `/api/cron/*` run checks in as monitor `cron-<job>` with its schedule (created on the first check-in); set each monitor to alert after one missed or failed check-in. This is the Vercel Cron heartbeat.

   Releases: with `SENTRY_AUTH_TOKEN` set, every Vercel build creates a release named after the commit SHA and uploads its source maps; events carry the same release (`sentryOptions()`), so "Resolved in next release" and regressions work.
3. **Vercel**: import the GitHub repository (framework preset Next.js, region `sin1`). Add the variables above for Preview and Production, including `STAGING_HOSTS` and `PRODUCTION_HOSTS` in both. Every pull request then gets a preview URL. Under Settings → Environments → Production, turn **off** "Auto-assign Custom Production Domains": a push to `main` then builds a staged production deployment that serves nobody until it is promoted, so migrations always run before the code that needs them ("Deploy to production" below). The same holds for a changed variable: it reaches production only after a redeploy **and** a promotion ("Applying a changed variable"). Cron jobs (Vercel Pro) come from `vercel.json` and run on production deployments only: `/api/cron/health-checks` every 15 minutes (one team email and a Sentry event per failed or missed pg_cron run, and a refresh of cached tour cards after held seats lapsed), `/api/cron/housekeeping` daily at 02:29 UTC (staged uploads older than 24 hours removed from `media-uploads`), `/api/cron/departure-checks` daily at 01:17 UTC (08:17 in Vietnam: team alerts for departures within 21 days below their minimum, at 21, 14 and 7 days) and `/api/cron/balance-reminders` daily at 01:43 UTC (08:43 in Vietnam: balance reminders 7 and 2 days before the due date, a one-time team alert for an overdue balance). Set `CRON_SECRET` first. All jobs are idempotent (exactly-once email keys), so a manual run is safe: `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/balance-reminders`. Team alerts go to `settings.contact.email`; without it they are not sent (and not spent), so a later run sends them once the address is set.
4. **GitHub**: enable branch protection on `main`, requiring the CI checks (`Lint, typecheck, unit tests`, `Security scans (npm audit, gitleaks)`, `Database (migrations, pgTAP, lint, types)`, `Build and E2E`).
5. **GitHub environments for migrations** (`.github/workflows/db-migrate.yml`, ADR-040). Settings → Environments → create `staging` and `production`. These settings, not the workflow file, are what protect the databases: a workflow edited on another branch can drop its own `main` check, but it cannot read an environment's secrets while that environment allows only `main`.
   - **Both** environments: **Deployment branches and tags** = selected branches, `main` only.
   - `production` also: **Required reviewers** = the admins who may approve a production migration, with "Prevent self-review" on once there is more than one admin.
   - In each environment, two **secrets**: `SUPABASE_PROJECT_REF` (the 20-letter ref of that environment's project) and `SUPABASE_ACCESS_TOKEN`, and one **variable**: `EXPECTED_PROJECT_NAME` (the project's name exactly as the Supabase dashboard shows it; it must contain the environment's name, for example `pta-staging` and `pta-production`). The workflow refuses a ref whose project has another name.
   - The token: Supabase → Account → Access tokens → a new **project-scoped** token for that one project (never a full-access "legacy" token, which reaches every project of the account; with `--remote` the CLI uses the token itself to write to the database, so the token alone is database write access). Permissions: database read and write, projects read, database pooling config read, backups read, and branching (production branch) read. One token per environment, each limited to its own project, so the staging token can never touch production. No database password is stored in GitHub.
   - Run it from Actions → "Database migrations" → Run workflow → branch `main`, target. The repository is public, so its run logs are too: the workflow writes only names, times and the migration list, never schema bodies or data. Nobody needs the token on their own machine.

Staging data: `npm run seed:users -- --allow-remote=<project-host>` creates the sample staff accounts on a non-production project. Never run it against production.

## Runbooks (operations, bookings and payments)

Monitoring (docs/specs/phase-6-hardening-launch.md decision 3): the uptime monitor calls `/api/health` every minute; Sentry collects errors and alerts by the rules above; `/api/cron/health-checks` emails the team (`settings.contact.email`) once per failed or missed pg_cron run; every cron run checks in with Sentry Cron Monitors and pings `CRON_HEARTBEAT_URL`.

- **A job failed or was missed** (team email "Tác vụ định kỳ thất bại" or "không chạy", Sentry tag `cron.job`). The alert jobs fail on purpose when something needs a person: `email-problems-alert` (see "Emails stuck or failed" below) and `booking-seat-invariant-alert` (a departure's `seats_reserved` disagrees with its bookings: find it with `select * from audit_logs where action = 'departures.seat_mismatch' order by created_at desc limit 5;`, compare with its pending, confirmed and completed bookings, and fix the count with an admin after finding the cause). For any other job, read the run in the SQL editor:

  ```sql
  select j.jobname, d.status, d.start_time, d.return_message
    from cron.job_run_details d join cron.job j using (jobid)
   where d.start_time > now() - interval '2 days' and (d.status = 'failed' or j.jobname = '<job>')
   order by d.start_time desc;
  ```

  Fix the cause, then run the job's command once by hand (`select command from cron.job where jobname = '<job>';`): every job is safe to repeat. A missed job (no success within 3 intervals, or 26 hours for a daily one) usually means pg_cron stopped: check `select * from cron.job where not active;` and the database's health in the Supabase dashboard; Supabase restarts the scheduler with the database. Each failed run is reported once, in at most one email per job per check (up to ten runs listed, the rest counted; the other runs' keys show in `email_logs` as `skipped` rows with `error = 'grouped'`); a job that starts failing again later alerts again. Without `settings.contact.email` nothing is emailed or spent: set it and the next check sends what is still open.
- **Vercel Cron stopped** (a Sentry Cron Monitor or the uptime monitor's heartbeat is late): check the project's Cron Jobs page in Vercel (Pro plan, production deployment, `CRON_SECRET` set; a 401 or 503 in the cron logs means the secret is missing or different). Run a job by hand with `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/health-checks`.
- **The site is down** (the uptime monitor pages after two failed `/api/health` calls): `/api/health` answers 503 when the database cannot be reached. Check the Vercel status and deployments (roll back to the last good deployment if a release broke it), then the Supabase project status. Payments keep arriving: VNPay retries IPNs and SePay/Casso retry webhooks on any non-2xx answer, and each is recorded once when they come back.
- **A payment gateway is down.** VNPay: customers see an error on VNPay's page or never come back; IPNs stop. Nothing is lost: holds lapse after 30 minutes and seats return. Tell customers to pay by bank transfer (the checkout offers it while the receiving bank account is set in `/admin/settings`), or hide VNPay by removing `VNPAY_TMN_CODE` and `VNPAY_HASH_SECRET` in Vercel Production and then redeploying **and promoting** ("Applying a changed variable" below; a redeploy alone stays staged and changes nothing) until VNPay recovers, then restore both and redeploy and promote again. Payments that succeeded during the outage arrive as late IPNs (confirmed if seats remain, otherwise in the attention queue) or must be recorded from the merchant portal ("A customer says they paid" below). SePay or Casso down: transfers still reach the bank account but no webhook arrives; the hold window is 2 hours, after which bookings expire. Reconcile from the bank statement: record each transfer on its booking, or wait for the provider's catch-up webhooks (they are deduplicated).
- **A webhook source was refused** (Sentry `payment.webhook_source_refused`, an error at most once per provider per 15 minutes: a call came from outside `VNPAY_IPN_ALLOWED_IPS` or `BANK_WEBHOOK_ALLOWED_IPS` but carried a valid signature or key). Look at the log lines (`payment.webhook_source_refused`, `signed: true`): steady calls while payments stop confirming mean the provider has new addresses; a burst while payments still confirm is someone replaying a signed VNPay return URL (VNPay signs it with the same parameters), which needs nothing. For new addresses: check the published list (SePay) or ask VNPay, add the address to the variable in Vercel Production, then redeploy **and promote** ("Applying a changed variable" below). VNPay and SePay retry a refused call, so payments sent meanwhile are confirmed once the new deployment serves; check the payments ledger for transfers the provider gave up on and record them from the bank statement. Refused calls without valid credentials are only logged (`payment.webhook_source_refused` with `signed: false`) and need nothing.
- **Sentry spike**: open the issue, check the release it started in (Sentry → Releases, named by commit) and roll back that deployment in Vercel if it is new. Personal data is not in Sentry events (`sentry-options.ts`), so issues can be shared with the team.


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
  - Balance overdue: remind the customer (the daily job already sent the 7- and 2-day reminders and one team alert). Bookings are never cancelled automatically (ADR-016). This item clears when the balance is paid or the booking is cancelled.
  - Departure cancelled: contact the customer, then cancel with a full refund or move them.
  - Paid a quote (`paid_quoted`) or a draft: money recorded for a booking with no hold never confirms it. Send the customer a payment link (Phase 4 PR 4D) or start a hold first, then refund or move the money.
  - When done, write what was done in "Đánh dấu đã xử lý". Money reasons are cleared by an MFA-verified accountant or admin, a cancellation request by an operator or admin. A cancellation requested while a money reason was open comes back to the operators once the money is resolved. Derived items (overdue balance, cancelled departure) clear on their own.
- **Emails stuck or failed** (the `email-problems-alert` pg_cron job fails when an email stays `queued` for over 10 minutes or one failed in the last 15, by `failed_at`, leaving out the health check's own `cron_alert` emails so a Resend outage cannot feed back into more alerts; the health check emails the team about the failed run, so a Resend outage reaches the team only if the alert email itself gets through: check Sentry too). Find them in the SQL editor:

  ```sql
  select created_at, failed_at, template, status, error, booking_id, dedupe_key
    from email_logs
   where (status = 'queued' and created_at < now() - interval '10 minutes')
      or (status = 'failed' and failed_at > now() - interval '1 day')
   order by created_at desc;
  ```

  `error` holds only an HTTP status or an error class (`HTTP 401`: wrong `RESEND_API_KEY`; `HTTP 403`: the sending domain is not verified; `HTTP 422`: a bad address; `TimeoutError` or `TypeError`: Resend unreachable). A `queued` row means the sender stopped between claiming the email and Resend's answer: check Resend's dashboard for the message before sending again. Fix the cause, then open the booking and press "Gửi lại" next to the email (sales roles and admin). A resend gets a fresh key and appears in the timeline; payment links are never resent (their token is not stored), so create a new link instead.
- **Refund:** pay the customer first, by bank transfer or cash, or refund in the VNPay portal. Then record it on the booking. The form refuses more than the amount received, net of earlier refunds.
- **Sending a newsletter campaign** (Resend broadcasts; Phase 6 PR 6P). Launch rule: no campaign before the unsubscribe page (`/ban-tin/huy`) is live in production. For each campaign:
  1. In `/admin/subscribers`, press "Xuất CSV" just before sending. The file lists active subscribers only and, per subscriber, a fresh single-use `unsubscribe_url` in their language; only the SHA-256 of each token is stored, so the link cannot be produced again. The export is in the audit log. Treat the file as personal data: delete it once imported.
  2. Import the file into the same Resend audience each time (create it once), with `unsubscribe_url` as a contact property. Keep Resend's "update existing contacts" from re-subscribing anyone Resend already lists as unsubscribed.
  3. In the broadcast, put `{{{contact.unsubscribe_url}}}` (the property's merge tag in Resend's editor) behind a visible "Unsubscribe" / "Hủy nhận bản tin" link in the footer. Every older campaign's link keeps working until it is used.
  4. Resend adds its own `List-Unsubscribe` header to broadcasts and handles it in the audience: a person who uses the mail client's unsubscribe button is unsubscribed in Resend (and receives no further campaign) but not yet in the site's database. Their row stays active in `/admin/subscribers` until a write-back exists (backlog), so always import into the same audience, where Resend keeps them excluded; never into a fresh audience.

### Deploy to production

Phase 6 decision 11, ADR-040. Production runs only what is on `main`, with production values only. Migrations go first, through the protected workflow, then the code is promoted.

**Every release**

1. Merge the pull request (squash) and wait for CI on `main` to be green.
2. Does the release add migrations? `git diff --name-only <commit now live in production>..origin/main -- supabase/migrations` (the live commit is on the production deployment's page in Vercel). If not, go to step 5.
3. **Staging first.** Actions → "Database migrations" → Run workflow, branch `main`, target `staging`. When it is green, check a preview or the staging site against it (`/api/health`, the pages the change touches).
4. **Production.** Run the workflow again with target `production`. An admin listed as a reviewer approves it. **The approval comes before the run has done anything**, so the production dry run does not exist yet when you approve: approve only after reading the **staging run of the same commit** (its "Dry run" step lists exactly the files production will get, since both projects carry the same migration history) and the file list of step 2. No green staging run of this commit, no approval. The workflow:
   - refuses a commit that is not on `main`, a project whose name is not the environment's `EXPECTED_PROJECT_NAME`, and production without point-in-time recovery;
   - writes the **restore point** (UTC time before the push) into the run summary. Copy it into the release note: it is the time to restore to if the release damages data ("Restore from backup");
   - writes the migration list before the push into the summary (no schema dump and no artifact: the repository and its run logs are public);
   - dry-runs, pushes (never the seed), then compares the types of the migrated `public` schema with `src/types/database.types.ts`. That catches a missing, extra or hand-made table, column, view, function signature or enum; it does not compare policies, triggers or function bodies, which only the migrations themselves guarantee (never change the schema in the dashboard). A mismatch fails the run: do not promote; find the missing or extra migration (`supabase migration list` is in the summary) or the dashboard change.

   Migrations must work with the code that is live now (add columns, tables and functions first; drop or rename only in a later release, once no live code uses them), because the old deployment keeps serving until step 5.
5. **Promote.** Vercel → Deployments → the production deployment of the `main` commit (staged, since domains are not auto-assigned). If the release had migrations, first **Redeploy** it: the staged build prerendered its pages against the old schema, and a new build reads the migrated one. Then Promote the newest deployment of that commit. Its build passed the deployment guards (`src/lib/env/deployment.ts`): a staging host, a test key or a dev-only switch in Production fails the build.
6. **Smoke test** (a staff member, a few minutes): `curl -s https://<domain>/api/health` answers `{"status":"ok","db":"ok"}`; the home page and one tour page in both languages; a booking up to the payment page (not paid; cancel the draft or let it expire); the contact form shows enabled; admin sign-in with MFA at `/auth/login` and `/admin` loads. Then watch Sentry (Releases → this commit) for 30 minutes.

**Applying a changed variable (redeploy and promote).** Vercel applies a changed environment variable only to new deployments, and with "Auto-assign Custom Production Domains" off a new production deployment is **staged**: it serves nobody until it is promoted. So every runbook step that changes a Production variable means: Vercel → Deployments → the current production deployment → ⋯ → Redeploy, wait for the build, open the new deployment → **Promote** (CLI: `vercel redeploy <current production URL>`, then `vercel promote <new deployment URL>`). Until the promotion, the old values keep serving: a rotated VNPay secret would make every IPN fail its signature check and paid holds would lapse, so promote at once and check that the production domain serves the new deployment.

**Rolling back.** Code: Vercel → Deployments → the previous production deployment → Instant Rollback (seconds; the database is untouched, which is why migrations stay backward compatible). An Instant Rollback serves that deployment **with the variables it was built with**: rolling back past a secret rotation brings the old, revoked value back (IPNs, webhooks, emails or the database start failing). After a rotation, roll back by redeploying the older commit with the current variables and promoting it, not with Instant Rollback. Database: never edit or revert an applied migration; write a new migration that undoes the change and ship it as a release. Restore from backup only when data was damaged, since everything written after the restore point is lost.

**First production deployment** (PR 6L, owner items 5–7):

1. Production Supabase project in Singapore with the PITR add-on; Auth settings as in "Deployment" step 1 (owner item 6a); `pg_cron` is created by the migrations, which then schedule its jobs.
2. Vercel Production variables (production values only, real keys, `CRON_SECRET` and `BOOKING_ACCESS_SECRET` different from staging's) and `STAGING_HOSTS`/`PRODUCTION_HOSTS` in every environment. Never set `SHOW_DESIGN_SYSTEM`, `VNPAY_STUB`, `SEED_*` or `E2E_*` there.
3. GitHub environment `production` with its project-scoped token, ref, `EXPECTED_PROJECT_NAME`, reviewers and the `main` rule ("Deployment" step 5); run the workflow with target `staging`, then `production` (it applies every migration).
4. **First admin** (ADR-032: no seeded users in production): Supabase → Authentication → Users → Invite user, with the owner's address (needs SMTP and the invite template). In the SQL editor: `update public.profiles set role = 'admin' where email = '<owner address>';` (the SQL editor runs as `postgres`, which the role guard trusts). The owner accepts the invitation, sets a password, enrols TOTP at `/admin/mfa`, fills in `/admin/settings` and invites the rest of the staff from `/admin/staff`. Never run `npm run seed:users` against production.
5. Promote and smoke-test as above; DNS, HTTPS and HSTS preload follow in PR 6L.

### Restore from backup

Supabase restores the database only: Storage objects are not in database backups. `media` images are re-uploaded from the originals the owner keeps (the rows in `media` survive a restore, so re-upload each file under its listed `path`, or upload again through `/admin/media`); `private` holds nothing yet (P1 vouchers). With PITR on, Supabase keeps no separate daily backups: PITR replaces them, with WAL archived about every two minutes (Supabase's stated worst-case RPO is two minutes).

**Rehearsal on staging** (decision 8, before launch; owner and one admin, about an hour). Staging needs PITR (or physical backups) for "Restore to a new project": add the PITR add-on to staging for the day of the rehearsal and remove it afterwards. Keep a log with the time of every step.

0. **Mark staging** (once; the marker stays on staging for later rehearsals and must **never** exist in production). In the staging SQL editor: `insert into public.settings (key, value) values ('staging_only_marker', '{"purpose": "restore rehearsals; never create this key in production"}') on conflict (key) do nothing;` (a private row: `is_public` defaults to false, and no page reads this key). The damage script below refuses to run in a database without it.
1. **Create data.** On the staging site, book a test departure as a guest with the contact name `Restore Rehearsal <date>` and a team mailbox, choose bank transfer, stop at the QR page. As an accountant with MFA, record the deposit on it in `/admin/bookings/<id>` ("Chuyển khoản", note `restore rehearsal`). This writes a booking, its payments, timeline events and a `payments.manual_record` audit row. Note the booking code.
2. **Note the time.** Wait 5 minutes (so the WAL is archived), then as sales change the booking's contact phone in the admin (the last write before the damage) and in the staging SQL editor run `select now();`: this is **T** (UTC). Run `scripts/restore-check.sql` there with the code: every row `ok`. Keep its output; row 1's "updated" time is the phone change, **W** (the last write before T).
3. **Damage it** one minute after T, in the staging SQL editor (it refuses a database without the staging marker of step 0 and any booking that is not a rehearsal booking, and keeps staging's seat count right):

   ```sql
   do $$
   declare
     target public.bookings;
   begin
     if not exists (select 1 from public.settings where key = 'staging_only_marker') then
       raise exception 'refused: this database has no staging_only_marker (production?)';
     end if;
     select * into strict target from public.bookings where code = '<booking code>';
     if target.contact_name not like 'Restore Rehearsal%' then
       raise exception 'refused: % is not a rehearsal booking', target.code;
     end if;
     if target.status in ('pending_payment', 'confirmed', 'completed') then
       update public.departures set seats_reserved = seats_reserved - (target.adults + target.children)
        where id = target.departure_id;
     end if;
     delete from public.payments where booking_id = target.id;
     delete from public.payment_links where booking_id = target.id;
     delete from public.internal_notes where booking_id = target.id;
     delete from public.email_logs where booking_id = target.id;
     delete from public.consent_records where booking_id = target.id;
     delete from public.reviews where booking_id = target.id;
     delete from public.bookings where id = target.id;  -- price lines, travellers, events, tokens cascade
   end $$;
   ```

   `scripts/restore-check.sql` now fails the booking, payments and events rows (the audit row stays: audit logs outlive what they describe, which is how a real loss is noticed). Note the time of the damage.
4. **Restore** (start the RTO clock): staging project → Database → Backups → "Restore to a New Project" → point in time **T** (not later: the damage happened after it) → Restore. Supabase creates a new project in the same region with the database, roles, Auth users and MFA factors; it does not copy Storage objects, Auth settings, API keys or Edge Functions, and its `pg_cron` jobs start at once. Wait until the new project is healthy, then at once, in the **new project's** SQL editor, stop its jobs so they stop writing to the copy: `select cron.unschedule(jobid) from cron.job;` (writes from the first minutes may already be there; that is why the RPO below is measured on the phone change, not on the newest row).
5. **Point a preview at it.**
   - New project → Authentication → URL configuration: site URL = the preview's host (optional: password sign-in does not need it).
   - Vercel → Settings → Environment Variables → add, for Preview and only for the branch `restore-rehearsal`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` of the new project (its API settings). The other Preview values stay on staging; do not send emails or take payments from this preview.
   - `git switch -c restore-rehearsal origin/main && git commit --allow-empty -m "chore: restore rehearsal" && git push -u origin restore-rehearsal` (no pull request needed). Vercel builds the preview with the new project's values; the deployment guards accept it, since its host is in neither list.
6. **Check** (stop the RTO clock when all pass):
   - `curl -s https://<preview host>/api/health` answers `{"status":"ok","db":"ok"}` (the preview may sit behind Vercel's deployment protection; open it signed in to Vercel, or use a protection bypass link).
   - Sign in on the preview as the admin (MFA as usual, the factors were restored). `/admin/bookings` → the booking: status, the recorded deposit and the timeline are there, with the phone of step 2. `/admin/audit-log` filtered on payments: the `payments.manual_record` row.
   - New project's SQL editor (or `psql "<its connection string>" -v code=<booking code> -f scripts/restore-check.sql`): every row `ok`, and the same values as the output kept in step 2.
7. **Record** in `docs/LAUNCH_CHECKLIST.md` ("PITR on, restore rehearsed"), with the log:
   - **RTO** = time from the start of step 4 to the end of step 6 (restore, preview build and checks).
   - **RPO**, from the phone change, never from the "newest write" row (the copy's `pg_cron` jobs wrote to it before they were stopped): if row 1's "updated" time in the copy equals **W** (and the booking page shows the new phone), everything written up to W came back, and the measured data window is T − W (under a minute here). If row 1 shows an earlier time, the phone change was lost: record T minus that time. Supabase's two-minute WAL interval is the bound when the restore point cannot be chosen (the project itself is lost).
   - The owner signs off on both numbers.
8. **Clean up** (keep the `staging_only_marker` row on staging): delete the new project (Settings → General → Delete project: it costs money and is a second copy of customer data), delete the branch-scoped Preview variables and the `restore-rehearsal` branch, and remove the PITR add-on from staging if it was added for the day.

**A real incident** (production data damaged or lost):

1. Stop the damage first (roll back the release, revoke a leaked key, block a job). Find the last good time **T** from the audit log, Sentry or the release's restore point.
2. Prefer **"Restore to a New Project"** at T: production keeps serving while you check the copy with steps 5–6 above. Then either copy the lost rows back into production from the copy (small, well-understood losses) or switch production to the copy: set the new project's URL and keys in Vercel Production and its hosts in `PRODUCTION_HOSTS` (replacing the old ones), copy the Auth settings, SMTP and templates of owner item 6a, re-upload `media` objects, update the GitHub `production` environment (a new token scoped to the new project, its ref and `EXPECTED_PROJECT_NAME`), redeploy and promote, then smoke-test.
3. An **in-place PITR restore** (Database → Backups → Point in time) overwrites everything after T and makes the project unavailable while it runs; use it only when the copy route is not possible.
4. Everything written after T is gone from the restored database, including payments: VNPay and the bank webhook do not resend notifications they delivered. Reconcile from the VNPay merchant portal and the bank statement for the period after T and record each payment by hand ("A customer says they paid" above); check `/admin/bookings/attention` afterwards.
5. Write down what happened, the RTO and the RPO in `docs/PROGRESS.md`.

### Rotate a secret

Rotate on a schedule you choose and at once after any suspected leak (a gitleaks finding, a lost laptop, a departed staff member with access). The pattern: create the new value at the provider, set it in Vercel for that environment only, **redeploy and promote** ("Applying a changed variable" above: a redeploy alone stays staged and the old value keeps serving), check that the production domain serves the new deployment, then revoke the old value. Once the old value is revoked, never Instant Rollback to a deployment from before the rotation (it would serve the revoked value). Use different values for staging and production. After a leak, also look at what the old value could reach in the meantime (Supabase logs, Resend logs, the payments ledger).

- **Supabase secret key** (`SUPABASE_SECRET_KEY`, `sb_secret_…`): Project Settings → API keys → create a new secret key, set it in Vercel, redeploy and promote, then delete the old key. Nothing else changes. (A legacy `service_role` JWT can only be rotated by rotating the project's JWT secret, which also signs every session: avoid it; move to the new API keys instead.) The publishable key is public by design; rotate it the same way if needed.
- **Migration access token** (`SUPABASE_ACCESS_TOKEN`, a secret of one GitHub environment): Account → Access tokens → create a new project-scoped token for the same project with the permissions of "Deployment" step 5, update the secret in that environment, revoke the old token. The workflow stores no database password; resetting the database password (Database settings) touches nothing in GitHub or Vercel.
- **`CRON_SECRET`**: `openssl rand -base64 48`, set it in Vercel Production, redeploy and promote. Vercel Cron sends the variable's current value, so runs between the change and the promotion may answer 401; every job is idempotent and the next run catches up (check the Cron Monitors in Sentry). Update any script that calls `/api/cron/*` by hand.
- **`BOOKING_ACCESS_SECRET`**: rotating it signs guests out of their checkouts: every `booking_access_<code>` cookie stops working, so a guest in the middle of paying lands on a page without the booking and must use the emailed link or the booking lookup (emailed links and lookup tokens are stored as hashes and keep working). It also changes the GA4 `transaction_id` of every booking (an HMAC derived from it), so a `purchase` shown again after the rotation counts as a new transaction in GA. Rotate at a quiet hour with no open holds: `select count(*) from public.bookings where status = 'pending_payment' and hold_expires_at > now();` should be 0. Then set the new value in Vercel, redeploy and promote.
- **VNPay hash secret** (`VNPAY_HASH_SECRET`): request the new secret in the VNPay merchant portal (or from VNPay support) and agree the switch time with them. At that time set it in Vercel Production, redeploy and **promote at once** (an unpromoted redeploy keeps the old secret serving). IPNs signed with the other secret during the switch fail the signature check (Sentry `payment.vnpay_bad_signature`); VNPay retries them, and once the new deployment serves they are recorded. Check the payments ledger against the merchant portal for the switch window.
- **Bank webhook key** (`BANK_WEBHOOK_SECRET`, SePay API key or Casso secure token): create the new key in SePay or Casso, change it in the provider's webhook settings and in Vercel Production, then redeploy and promote straight away. Calls in between answer 401 and are retried by the provider; afterwards check "Chuyển khoản chưa khớp" and the bank statement for the window.
- **Resend API key** (`RESEND_API_KEY`): Resend → API keys → create a key with sending access for the domain. Set it in Vercel, redeploy and promote, **and** paste it as the SMTP password in Supabase → Authentication → SMTP settings (Auth emails use it too). Then delete the old key. Emails sent with the old key after its deletion fail with `HTTP 401` in `email_logs`: resend them from the booking page ("Emails stuck or failed").
- **Others**: `UPSTASH_REDIS_REST_TOKEN` (Upstash console → reset the token; set, redeploy and promote; Redis calls fail open or closed per ADR-029 in between), `TURNSTILE_SECRET_KEY` (Cloudflare → Turnstile → rotate secret; set, redeploy and promote; forms fail closed until then), `SENTRY_AUTH_TOKEN` (build only; the next build uses it), `CRON_HEARTBEAT_URL` (regenerate in the uptime monitor).

## Workflow

Work happens on short-lived branches with one commit per spec step, merged through pull requests after CI and an independent review (ADR-020). See [`CLAUDE.md`](CLAUDE.md).
