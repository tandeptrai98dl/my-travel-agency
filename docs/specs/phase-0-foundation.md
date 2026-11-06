# Task Spec — Phase 0: Foundation

Last updated: 2026-11-06 · Task: TASK-P0-01 · Phase: 0 (`DEVELOPMENT_PLAN.md`)

## Summary

Phase 0 turns the restructured starter into a production-shaped skeleton: housekeeping, test tooling, environment validation, the full Supabase schema with baseline RLS, roles and staff MFA, VI/EN routing, a protected admin shell, monitoring and CI. No customer-facing features are built here.

**Estimate**: 1.5 weeks. **References**: `ARCHITECTURE.md`, `DATABASE.md`, `DECISIONS.md` (ADR-004 to ADR-019), `CLAUDE.md`.

## Current state (verified 2026-11-06)

- Next.js 16.4.5 with `cacheComponents`, React 19, Tailwind 3, shadcn/ui, next-themes, npm.
- Starter auth pages under `src/app/auth/*`, Supabase clients in `src/lib/supabase/{client,server,proxy}.ts`, `src/proxy.ts`.
- The move into `src/` is staged but not committed; git has one commit.
- `npx tsc --noEmit` passes. `npx eslint src` reports one error (`require()` in `tailwind.config.ts`); `npm run lint` also scans `.next/` and reports thousands of generated-code errors.
- No Supabase project, migrations or tests yet.

## Working assumptions (owner may change)

| # | Topic | Default |
| --- | --- | --- |
| A1 | Hosting tier (ADR-018) | Free tiers for local/dev; Pro plans before shared staging goes live |
| A2 | Email sending domain | Resend test domain; SPF/DKIM/DMARC once the real domain exists |
| A3 | Google sign-in | Enabled only when `GOOGLE_OAUTH_ENABLED=true` and the provider is configured; email/password always on |
| A4 | Local database | `npx supabase start` with Docker; if Docker is unavailable, a dedicated cloud dev project |

## Preconditions (owner)

- [ ] Supabase account (staging project in Singapore can wait until step 10)
- [ ] Vercel project linked to the repository
- [ ] Sentry project (Next.js); Resend account
- [ ] Docker Desktop installed for local Supabase
- [ ] Optional: Google Cloud OAuth client

## Steps

One commit per step. After each step: `npm run lint`, `npx tsc --noEmit`, and (from step 2) `npm test`; from step 5 also `npx supabase test db`.

### Step 1 — Housekeeping

- Commit the staged `src/` restructure as its own commit (`chore: move app into src/`).
- `tailwind.config.ts`: replace `require("tailwindcss-animate")` with an ES import.
- `eslint.config.mjs`: ignore `.next/`, `node_modules/`, `supabase/.temp/`, generated `src/types/database.types.ts`; make `npm run lint` pass.
- Remove starter tutorial content: `src/components/tutorial/`, `src/app/protected/`, `src/components/{hero,deploy-button,next-logo,supabase-logo,env-var-warning}.tsx`; replace `src/app/page.tsx` with a minimal placeholder. Keep the auth forms, `auth-button`, `logout-button` and `theme-switcher` components.
- Add scripts: `typecheck`, `test`, `test:e2e`, `db:types`, `format`.

### Step 2 — Test tooling (ADR-014)

- Vitest with a sample unit test; Playwright config with one smoke test (`/api/health`, added in step 9).
- pgTAP runs through `npx supabase test db` (wired in step 5).

### Step 3 — Environment validation

`src/lib/env/` validates variables with Zod: `schema.ts` (schemas), `public.ts` (client-safe literals, no Zod in the browser) and `server.ts` (`server-only`, validates public and server values at startup); missing or invalid values fail fast with the variable name. Update `.env.example` (no real values):

| Variable | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | `http://localhost:3000` locally |
| `NEXT_PUBLIC_SUPABASE_URL` | public | existing |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | existing |
| `SUPABASE_SECRET_KEY` | server | secret / service-role key; never `NEXT_PUBLIC_` |
| `GOOGLE_OAUTH_ENABLED` | server | A3 |
| `RESEND_API_KEY`, `EMAIL_FROM` | server | also the Supabase Auth SMTP (configured in the dashboard) |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | server / public | |
| `SENTRY_AUTH_TOKEN` | build | CI/Vercel only |
| `CRON_SECRET` | server | used from Phase 4 |

### Step 4 — Supabase CLI and base schema

- `npx supabase init`; commit `supabase/config.toml` (email confirmations on, TOTP MFA enabled, redirect URLs for `/auth/confirm` and `/auth/callback`).
- Migrations, one per group, copied exactly from `DATABASE.md` (enums, identity, media, taxonomy, catalog, inquiries, booking, payments, content, system & compliance), plus the `set_updated_at()` trigger on every table with `updated_at` and `booking_code_seq`. Extensions go into the `extensions` schema; `pg_cron` is enabled without jobs.
- `npm run db:types` → `src/types/database.types.ts`.
- Check: `npx supabase db reset` runs cleanly; `npx supabase db lint` has no errors.

### Step 5 — Auth integration, RLS and storage

- Trigger on `auth.users` insert → `profiles` row (email, locale from metadata, role `customer`).
- Trigger on `profiles` update → reject `role` changes unless the actor is admin (service role allowed for seeding/invitations).
- Helpers (`security definer`, `stable`, `set search_path = ''`): `current_user_role()`, `has_role(user_role[])`, `is_staff()`, `is_mfa_verified()`, plus `is_admin()` as a wrapper (ADR-004 naming).
- Enable RLS on all 36 tables; implement the policy summary in `DATABASE.md` (public published content, customer-own bookings, staff by role, `aal2` on financial tables, service-role-only writes for compliance tables).
- Storage buckets: `media` (public read, editor/admin write) and `private`.
- pgTAP tests: RLS enabled on every table; anon cannot read bookings, payments, inquiries, profiles, draft tours or unpublished translations; a customer reads only their own bookings and cannot change their role; an accountant without `aal2` cannot read payments; admin can change roles.

### Step 6 — Seed data

- `supabase/seed.sql`: settings (`company`, `contact`, `booking_rules` defaults from ADR-016, `homepage`), one default cancellation policy, 3 countries with regions/cities (each with `key`), 6 tours (group and private, domestic and international, VI + EN; one draft; one with an unpublished EN translation), departures for the next 6 months.
- `scripts/seed-users.ts` (`npm run seed:users`): one user per role via the Auth Admin API; refuses non-local URLs unless `--allow-remote`.

### Step 7 — Supabase clients and auth helpers

- Keep `client.ts`, `server.ts`, `proxy.ts`; add `src/lib/supabase/admin.ts` (secret key, `import 'server-only'`).
- `src/lib/auth/get-user.ts` (verified user + profile), `require-role.ts` (`requireRole(roles)`, requires `aal2` for admin and accountant), `permissions.ts` (the matrix from `ARCHITECTURE.md`).
- Unit tests for `requireRole` and the permission map.

### Step 8 — Internationalisation and proxy

- next-intl: locales `vi` (default, no prefix) and `en`; `src/i18n/{routing,request,pathnames}.ts` with every public route from `ARCHITECTURE.md`; `messages/vi.json` and `messages/en.json` with Phase 0 strings only.
- Move the placeholder home into `src/app/[locale]/`. Use separate root layouts (route groups) so `[locale]`, `admin` and `auth` each render correct `<html lang>`; keep the starter `/auth/*` pages working.
- `src/proxy.ts`: combine next-intl locale handling with the existing Supabase session refresh; add security headers (HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`); skip locale handling for `/admin`, `/api`, `/auth` and static files. CSP comes in Phase 3.

### Step 9 — Admin shell, health check

- `src/app/admin/layout.tsx`: `requireRole(staffRoles)`; staff without MFA go to `/admin/mfa` to enrol TOTP; admin and accountant must reach `aal2`.
- `src/app/admin/page.tsx`: placeholder showing the user's role (Vietnamese UI).
- `src/app/api/health/route.ts`: `{ status, db }` with a cheap database check; no secrets.

### Step 10 — Monitoring, CI, deployment

- Sentry (server, client, edge).
- `.github/workflows/ci.yml`: npm ci, lint, typecheck, Vitest, `supabase start` + `db reset` + `test db` + `db lint`, regenerate types and fail if changed, Playwright smoke test.
- Vercel previews per PR with env vars for Preview and Production (staging Supabase project for both until production exists).
- `README.md`: local setup and where each secret comes from.

## Acceptance criteria

- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` pass; ESLint no longer scans `.next/`
- [ ] Starter tutorial content removed; starter auth pages still work
- [ ] All 36 tables exist; pgTAP proves RLS is enabled on every table
- [ ] pgTAP: anon cannot read bookings, payments, inquiries, profiles, draft tours or unpublished translations
- [ ] pgTAP: a customer cannot change their role; only admin can; an accountant without `aal2` cannot read payments
- [ ] `database.types.ts` is generated and CI fails when it is stale
- [ ] Missing env vars stop the app with a clear message; the secret key never appears in client bundles
- [ ] `/` and `/en` render in the right language; switching keeps the path
- [ ] Seeded staff can sign in; customers cannot open `/admin`; admin and accountant must complete MFA
- [ ] `/api/health` returns `ok` locally and on a Vercel preview
- [ ] CI green on the Phase 0 PR; a test error reaches Sentry
- [ ] `PROGRESS.md` updated with verified results

## Out of scope

Design tokens and UI (Phase 1), admin CRUD (Phase 2), public pages (Phase 3), booking/payment functions and `pg_cron` jobs (Phase 4), localized customer auth pages (Phase 5).

## Handover prompt

```text
Read CLAUDE.md, the docs it imports, and docs/specs/phase-0-foundation.md.
Implement TASK-P0-01 step by step, in order, one commit per step.
Use assumptions A1–A4; do not change them. Copy the schema from docs/DATABASE.md
exactly; if something cannot work as written, stop and explain.
After each step run npm run lint, npx tsc --noEmit, npm test (and npx supabase test db
from step 5). Do not add libraries beyond ADR-014.
Write all code, comments and commits in English. When done, update docs/PROGRESS.md,
and report every acceptance criterion as pass/fail with evidence, plus anything
blocked by a missing account or secret.
```
