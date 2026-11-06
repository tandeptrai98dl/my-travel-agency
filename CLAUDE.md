# PREMIUM TRAVEL AGENCY

## PROJECT OVERVIEW

Bilingual (Vietnamese/English) website for a travel agency business.
Brand positioning: **Premium Luxury Travel**. Every page, piece of copy and UI detail should feel high-end.
Objective: build a website system capable of operating a real-world business: tour catalog, online booking and payment, private-trip inquiries, customer accounts and a role-based admin (full scope, ADR-005).

## TECHNOLOGY STACK

- Next.js App Router (`src/` directory, `cacheComponents` enabled), React 19
- TypeScript (strict)
- Tailwind CSS 3
- shadcn/ui (new-york style) + lucide-react icons; next-themes installed (public site uses a fixed light theme, ADR-017)
- Supabase (Postgres, RLS, Postgres functions, pg_cron) via `@supabase/ssr`; schema managed with the Supabase CLI
- Supabase Auth (cookie-based sessions, TOTP MFA for staff)
- Supabase Storage
- next-intl (VI default, EN under `/en`)
- Zod, React Hook Form, Tiptap, Motion (sparingly)
- Resend + React Email, Upstash Redis, Cloudflare Turnstile, Sentry
- Payments: VNPay, VietQR bank transfer (SePay or Casso)
- Testing: Vitest, Playwright, pgTAP
- Vercel (hosting)

Stack additions are recorded in `docs/DECISIONS.md` (ADR-014). Add each library only in the phase that needs it.

## DOCUMENTATION

Read these before starting any task (they are imported automatically):

- @docs/PROJECT_BRIEF.md (goals, users, scope, resolved questions)
- @docs/ARCHITECTURE.md (structure, data flow, auth, routes, security)
- @docs/DATABASE.md (schema, RLS, functions, migrations)
- @docs/DESIGN_SYSTEM.md (tokens, typography, components)
- @docs/FEATURES.md (feature list and priorities)
- @docs/DEVELOPMENT_PLAN.md (phases and next tasks)
- @docs/PROGRESS.md (current status, log, known bugs)
- @docs/DECISIONS.md (ADRs)

Task specs live in `docs/specs/` (e.g. `phase-0-foundation.md`, `tour-listing.md`). Read the spec for the task you are given.

## DEVELOPMENT RULES

1. Do not modify the technology stack without permission.
2. Do not delete completed functionality without permission.
3. Do not write the entire application in a single file.
4. Use reusable components.
5. Use TypeScript consistently. No `any` unless justified.
6. Responsive across desktop, tablet, and mobile.
7. Prioritize accessibility and SEO.
8. Do not hardcode business data in production. Load tours, prices, contacts and similar data from Supabase.
9. Do not commit API keys, passwords, or secrets. Use `.env.local` and keep `.env.example` updated.
10. Do not skip Supabase RLS security checks. Every table has RLS enabled and policies defined.
11. Write all code, comments, commit messages, PR descriptions and documentation in English (ADR-007). UI text goes in `messages/vi.json` and `messages/en.json`.
12. Seat holds and payment recording happen only in Postgres functions; payments are confirmed only from verified IPN/webhooks (ADR-012).

## WORKFLOW

Before each task:

1. Read relevant documentation and the task spec.
2. Review current code.
3. Analyze the scope of changes.
4. Outline the implementation plan.
5. Wait for confirmation if the task involves changes to architecture, database, or critical data beyond what the docs already approve.
6. Execute in parts on a feature branch (one spec step per commit) and open a pull request (ADR-020).
7. Run lint, typecheck, and appropriate tests.
8. Report actual results.

## BRANCHES AND PULL REQUESTS (ADR-020)

- Never commit directly to `main`. Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- The pull request description reports every acceptance criterion as pass/fail with evidence, and lists anything blocked by missing accounts or secrets.
- An independent reviewer (a separate agent) checks each pull request against the spec, RLS rules and security rules.
- Squash-merge only when CI is green and the review has no unresolved critical or major findings.
- Only one branch at a time may add files to `supabase/migrations/`.

## PROGRESS MANAGEMENT

After each task:

- Update `docs/PROGRESS.md`.
- Record completed features.
- Record uncompleted features.
- Record remaining bugs.
- Record new technical decisions in `docs/DECISIONS.md` if approved.

Do not mark as completed until verified.

## COMMANDS

```bash
npm install            # install dependencies
npm run dev            # dev server at http://localhost:3000
npm run build          # production build
npm run lint           # ESLint
npx tsc --noEmit       # type check
npm test               # Vitest (added in Phase 0)
npm run test:e2e       # Playwright (added in Phase 0)
npx supabase start     # local Supabase (requires Docker)
npx supabase db reset  # re-apply migrations + seed locally
npx supabase test db   # pgTAP tests
npx supabase db lint   # schema lint
npm run db:types       # regenerate src/types/database.types.ts
```

Environment: copy `.env.example` to `.env.local`. Variables are validated at server start by `src/lib/env/server.ts` (via `src/instrumentation.ts`); client code imports `src/lib/env/public.ts`.

## PROJECT STRUCTURE

```
src/
  app/[locale]/   # public website + customer account (VI default, /en)
  app/admin/      # Vietnamese-only admin, role + MFA checked in the layout
  app/api/        # payment IPN/webhooks, cron, health, OG images
  app/auth/       # auth confirm/callback routes
  modules/        # business logic: <module>.service.ts, .repository.ts, .schemas.ts, .actions.ts
  components/     # feature components
  components/ui/  # shadcn/ui primitives (add with `npx shadcn@latest add <name>`)
  lib/            # utilities, env, money, auth helpers, Supabase clients (lib/supabase/{client,server,proxy,admin}.ts)
  i18n/           # next-intl routing and pathnames
  types/          # generated database types (never edit by hand)
  proxy.ts        # Next.js proxy: locale, Supabase session refresh, redirects, security headers
supabase/         # migrations, seed.sql, pgTAP tests
messages/         # vi.json, en.json
emails/           # React Email templates
public/           # static assets
docs/             # project documentation and task specs
```

## CODE CONVENTIONS

- Import with the `@/` alias (maps to `src/`), e.g. `import { Button } from "@/components/ui/button"`.
- Use Server Components by default. Add `"use client"` only for interactivity.
- Supabase: use `@/lib/supabase/server` in Server Components, route handlers and server actions, and `@/lib/supabase/client` in Client Components. `@/lib/supabase/admin` (service role, `server-only`) is used only inside server-side `src/modules/*` for webhooks, cron and validated guest writes. Never use the service-role key in client code.
- Layers: `app` → `modules` → `lib`. Components receive props and never import repositories or Supabase clients.
- Every Server Action and Route Handler validates input with Zod and calls `requireRole()` for staff actions.
- Caching (ADR-015): cached reads use `"use cache"` + `cacheTag()` + `cacheLife()`; admin writes call `revalidateTag()`/`updateTag()`; live data and anything reading cookies or `searchParams` renders inside `<Suspense>`.
- Money is integer dong (`bigint` in the database, `number` in TypeScript) handled only through `@/lib/money`.
- Schema changes are new migration files in `supabase/migrations/`; regenerate types after each one; new tables and policies need pgTAP tests.
- Use the design tokens in `src/app/globals.css` and `tailwind.config.ts` instead of hard-coded colors.
- File names are kebab-case (`tour-card.tsx`) and component exports are PascalCase (`TourCard`).
- Use the Next.js Metadata API for SEO (titles, descriptions, Open Graph, hreflang) on every public page.
- Commits follow Conventional Commits, e.g. `feat(booking): add seat hold function`.
