# Launch checklist

The acceptance criteria of `docs/specs/phase-6-hardening-launch.md` (decision 12). The domain points at production only when every line is **done**, with a date, a name and evidence (a link, a screenshot or a log line). PR 6L completes it.

Status values:

- **done**: proven where the criterion says (production, staging or the launch commit), with evidence.
- **code ready**: the code path, tests and runbook exist and pass in CI; the check the criterion names (production, staging, an owner account) is still to be done. Not done.
- **open**: nothing proven yet, or waiting for an owner item ("What the owner must provide", numbered there).

First filled in PR 6C (2026-11-07) from what CI and merged pull requests prove. Every line below is still open for launch.

## Security

| # | Criterion | Status | Date | Name | Evidence |
| --- | --- | --- | --- | --- | --- |
| S1 | `docs/SECURITY_REVIEW.md` complete: every line pass or accepted with a reason; role-matrix and definer-function pgTAP green | code ready | | | #58: `docs/SECURITY_REVIEW.md`; `supabase/tests/50_role_matrix_test.sql`, `51_definer_functions_test.sql` green in CI "Database". Open lines wait for owner items 1, 2, 4, 5, 6, 8, 9 (staging advisors, gateway checks, legal) |
| S2 | Supabase Security Advisor clean on production (or accepted items listed) | open | | | owner item 5 (production project) |
| S3 | Webhook allow-lists configured in production; `VNPAY_STUB` refused there | code ready | | | refusals: `src/lib/env/schema.test.ts` (#58: allow-lists required per configured gateway, `VNPAY_STUB` refused with `VERCEL_ENV=production`); values: owner items 8, 9, set in Vercel Production |
| S4 | HSTS with `includeSubDomains; preload` on the production domain, preload submitted | open | | | PR 6L, owner item 1 (domain) |
| S5 | No high or critical dependency issue open; no secret in the git history | code ready | | | CI "Security scans (npm audit, gitleaks)" on every run since #58 (`scripts/check-audit.mjs`, `.gitleaks.toml`); re-check on the launch commit (L5) |
| S6 | Supabase Auth settings verified on production (owner item 6a) | open | | | owner item 6a; list in `README.md` "Deployment" step 1 |
| S7 | Previews never use production secrets (env guard and a check of every Vercel environment) | code ready | | | env guard: `src/lib/env/deployment.ts`, `deployment.test.ts` (PR 6C: preview refuses every `PRODUCTION_HOSTS` host and VNPay's production gateway; production refuses staging hosts, test keys and dev switches). Still to do: `STAGING_HOSTS`/`PRODUCTION_HOSTS` in every Vercel environment, and a screenshot of each environment's variable list showing different values for `CRON_SECRET`, `BOOKING_ACCESS_SECRET`, `BANK_WEBHOOK_SECRET`, `RESEND_API_KEY` (owner item 5). Evidence also for the migration tokens: a screenshot of each `SUPABASE_ACCESS_TOKEN` in Supabase → Account → Access tokens showing it scoped to its **one** project (no full-access "legacy" token in either GitHub environment) with the permissions of `README.md` "Deployment" step 5 |
| S8 | Branch protection on `main` requires the CI checks (ADR-020) | open | | | owner: the four checks in `README.md` "Deployment" step 4. Also, for the migration workflow (the environment settings are its real guard, since its own `main` check can be edited out on a branch): screenshots of GitHub → Settings → Environments showing **both** `staging` and `production` limited to the `main` branch, required reviewers on `production`, and each environment's `EXPECTED_PROJECT_NAME` naming its own project |

## Payments

| # | Criterion | Status | Date | Name | Evidence |
| --- | --- | --- | --- | --- | --- |
| P1 | VNPay sandbox test cases signed off by VNPay; one live VNPay payment and one live bank transfer confirmed by IPN or webhook and refunded or reconciled | open | | | owner items 8, 9; decision 9 procedure; results in `docs/QA_REPORT.md` (PR 6L). In CI only with the signed stub: `tests/e2e/booking-flow.spec.ts`, `payments.spec.ts`, `booking-core.spec.ts` |

## Data and operations

| # | Criterion | Status | Date | Name | Evidence |
| --- | --- | --- | --- | --- | --- |
| D1 | PITR on, restore rehearsed with recorded RTO and RPO | code ready, never run | | | PR 6C: `.github/workflows/db-migrate.yml` refuses production without PITR (Management API) and prints the restore point; `README.md` "Restore from backup" (rehearsal steps) and `scripts/restore-check.sql` (tried only on a local database). Still to do: PITR add-on on production, the rehearsal on staging with RTO = …, RPO = … (measured on the phone change, `README.md` step 7) and the owner's sign-off on both numbers **and on "PITR only, no copy outside Supabase"** (deleting the project or losing the owner's Supabase account loses the database and its backups together, ADR-040), owner item 5 |
| D2 | Failed and missed scheduled jobs alert the team; the uptime monitor pages the on-call person; Sentry alert rules live | code ready | | | #54: `cron_failures()` (`28_monitoring_housekeeping_test.sql`), `/api/cron/health-checks` (`src/modules/operations/monitoring.service.test.ts`, `tests/e2e/cron-health.spec.ts`). Still to do: Sentry rules (`README.md` "Deployment" step 2), uptime monitor and on-call names (owner items 7, 11) |
| D3 | Staged media and expired token cleanup running; trimmed webhook payloads never include unmatched or error events | code ready | | | #54: `booking-tokens-cleanup`, `webhook-payload-trim` (`28_monitoring_housekeeping_test.sql`: an unmatched event older than 400 days can still be assigned), `/api/cron/housekeeping`. "Running": `select jobname, status, start_time from cron.job_run_details …` on production after a day |
| D4 | `CRON_SECRET` set and Vercel Cron running, with its heartbeat | code ready | | | #54: `CRON_SECRET` required in production (`src/lib/env/schema.test.ts`), Sentry Cron Monitors and `CRON_HEARTBEAT_URL`. PR 6C fixed `CRON_HEARTBEAT_URL` never reaching the server env (`src/lib/env/deployment.test.ts`, "passes every schema variable"). Still to do: Vercel Cron page and a heartbeat on production (owner items 5, 11) |
| D5 | A test error reaches Sentry (`/api/monitoring/test-error`); `/api/health` answers on a preview and in production | open | | | route and its access rules: `tests/e2e/monitoring.spec.ts`; needs owner items 5, 7 |
| D6 | SPF, DKIM and DMARC passing for the sending domain; `settings.contact.email` set | open | | | owner item 6 |

## Public site

| # | Criterion | Status | Date | Name | Evidence |
| --- | --- | --- | --- | --- | --- |
| W1 | Lighthouse targets met on the listed pages (or accepted); Core Web Vitals "Good" on staging | open | | | PR 6Q (Stream B), owner items 3, 5; initial-JS budget enforced in CI (`scripts/check-js-budget.mjs`) |
| W2 | Keyboard and screen-reader passes done; no open serious accessibility issue | open | | | PR 6Q, `docs/QA_REPORT.md` (Stream B); axe in CI (`tests/e2e/a11y.spec.ts` and per-page checks) |
| W3 | Real content in both languages; legal footer with licence and the Ministry notification | open | | | owner items 2, 3 |
| W4 | Terms, privacy, cancellation and payment policies published in both languages after counsel's review | open | | | owner item 4 |
| W5 | Analytics loads only after consent, events verified in GA4 DebugView, no code or token in what GA receives (Enhanced measurement off in the GA4 data stream, checked in DebugView on a client-side navigation into checkout); cookie choices recorded | code ready | | | #55: `tests/e2e/analytics.spec.ts`, `analytics-csp.spec.ts`, `34_cookie_consents_test.sql`; production refuses CI's fake ID (PR 6C). Still to do: DebugView with the real ID (owner item 10) |
| W6 | Newsletter unsubscribe live before any campaign; contact and newsletter forms enabled in production | code ready | | | #55: `tests/e2e/newsletter-unsubscribe.spec.ts`, `35_newsletter_unsubscribe_test.sql`; forms need owner items 4, 6, 7 |
| W7 | Old-site URLs answer 301 to live pages (if an old site exists) | open | | | owner item 1; redirects: `tests/e2e/redirects.spec.ts` |
| W8 | Search Console verified for both languages, sitemaps submitted, Rich Results Test passing | open | | | owner item 10, PR 6Q |

## Launch

| # | Criterion | Status | Date | Name | Evidence |
| --- | --- | --- | --- | --- | --- |
| L1 | Counsel's review of retention, deletion and the impact-assessment question done, with any dossier filed (owner item 4a) | open | | | owner item 4a |
| L2 | Every decision 14 item closed with evidence | open | | | Stream A: failed pg_cron runs read, cleanup jobs, `failed_at` windowing, redirects removed on publishing in the journal, page and taxonomy editors, `tours` refreshed after lapsed holds: #54. Open: the 50 ms redirect timeout's cold-start cost on staging (owner item 5). Stream B: cookie-consent proof (#55); open: privacy policy processors (owner item 4), the build cache on the first Vercel preview, the Redis language hash with real Upstash (owner items 5, 7) |
| L3 | Staff UAT signed off: zero open critical issues | open | | | PR 6L, `docs/UAT.md`, owner item 12 |
| L4 | Production smoke test passed; two weeks of close monitoring with no critical bug open | open | | | PR 6L; smoke test list in `README.md` "Deploy to production" |
| L5 | Lint, typecheck, unit, pgTAP, E2E and the JS budget green in CI on the launch commit | open | | | the launch commit's CI run (link) |
