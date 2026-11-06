# Progress

Update this log at the start and end of each work session. Newest first.

## Current status

- **Phase:** 0 (Foundation) of the full-scope plan (ADR-005, ADR-019)
- **Next up:** implement `docs/specs/phase-0-foundation.md` (TASK-P0-01): housekeeping, test tooling, env validation, Supabase schema + RLS, auth/roles/MFA, i18n, admin shell, CI
- **Owner actions:** create Supabase/Vercel/Sentry/Resend accounts; start the VNPay contract, e-commerce notification and bilingual content tracks; confirm the proposed ADRs (016–019) and the palette/fonts

## Log

### 2026-11-06 (Phase 0 — PR 1 of 4: housekeeping, test tooling, env validation, CI)

Branch `feat/p0-housekeeping` (spec steps 1–3 + CI skeleton + ADR-020).

- Done:
  - Removed starter tutorial content, the `/protected` example and starter branding; placeholder home page (`noindex`).
  - Fixed the `tailwind.config.ts` lint error; ESLint ignores build output and generated files.
  - Vitest and Playwright configured; Playwright smoke test for the home page (the spec's `/api/health` smoke test moves to PR 3, where the route is added).
  - Environment validation with Zod in `src/lib/env/`: `public.ts` exports client-safe literals (no Zod in the browser), `server.ts` (`server-only`) validates public and server values at startup via `src/instrumentation.ts`; rejects secret keys (new `sb_secret_` and legacy `service_role` JWT) used as the publishable key; `.env.example` complete.
  - GitHub Actions CI: lint, typecheck, unit tests, production build, sentinel-based check that server-only values never reach client bundles, Playwright smoke.
  - ADR-020 (delivery workflow) and the matching `CLAUDE.md` section.
- Verified: `npm run lint`, `npm run typecheck`, `npm test` (10 tests) locally and in CI; production build, client-bundle leak check and E2E smoke in CI (the cloud workspace blocks Google Fonts, so `next build` cannot run there).
- Independent review: changes requested, then addressed (leak check, Zod removed from the client, legacy JWT check, doc paths, test assertion count, CI concurrency).
- Deviations from the spec: env code lives in `src/lib/env/{schema,public,server}.ts` instead of one `env.ts`; `SUPABASE_SECRET_KEY` stays optional until the admin client lands in step 7; no Prettier (not in ADR-014); the `server-only` package is added (required by `ARCHITECTURE.md` for the admin client; not listed in ADR-014); `@types/node` raised to 22 to match the runtime.
- Remaining Phase 0: Supabase schema, RLS, pgTAP, seed (PR 2); clients, auth helpers, i18n, admin shell, health check (PR 3); Sentry, Vercel, README (PR 4).

### 2026-11-06 (documentation update — full scope)

- Owner chose the full-scope MVP. Recorded ADR-005 to ADR-019 in `DECISIONS.md` (ADR-005 to ADR-015 accepted; ADR-016 to ADR-019 proposed).
- `PROJECT_BRIEF.md`: open questions §8 resolved; remaining owner inputs listed in §9.
- `ARCHITECTURE.md`: rewritten for the full scope (modules, Supabase clients, Cache Components, booking flow, permission matrix, VI/EN routes, security, SEO, performance).
- `DATABASE.md`: approved 36-table schema with RLS summary, storage and Postgres functions (replaces the draft).
- `DESIGN_SYSTEM.md`: kept the brief's palette; added Vietnamese-ready typography, motion, voice and the full component list.
- `FEATURES.md` and `DEVELOPMENT_PLAN.md`: full-scope features (P0/P1/P2) and Phases 0–6.
- `CLAUDE.md`: stack additions, English rule, new commands and conventions.
- Added task specs `docs/specs/phase-0-foundation.md` and `docs/specs/tour-listing.md`.
- Verified state: `npx tsc --noEmit` passes; `npx eslint src` has 1 error (`tailwind.config.ts`); `npm run lint` also scans `.next/`. No code changed in this update.

### 2026-11-06

- Scaffolded the project from the Next.js + Supabase starter (auth pages, shadcn/ui, Tailwind).
- Restructured: moved `app/`, `components/`, `lib/` and `proxy.ts` into `src/`, and added `public/`.
- Updated the `@/*` alias in `tsconfig.json`, the CSS path in `components.json` and the Tailwind content globs.
- Added `CLAUDE.md` and the `docs/` set.
- Updated `CLAUDE.md` with the project rules, workflow and progress-management rules.
- Replaced `PROJECT_BRIEF.md` with the official brief. Re-aligned `FEATURES.md`, `DESIGN_SYSTEM.md` (luxury palette and typography, proposed) and `DEVELOPMENT_PLAN.md` to it.
- Marked `DATABASE.md` as a draft with known gaps. The schema is pending decisions on the open questions.

## Blockers

- None

## Known issues

- `src/lib/supabase/proxy.ts` (from the starter) redirects every signed-out visitor to `/auth/login` on any path except `/`. Must be replaced in PR 3 so public pages stay public.
- The root layout still uses the starter Geist font and a user-selectable theme; replaced in Phase 1 (design tokens, ADR-017).
