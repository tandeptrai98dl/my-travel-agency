# Decisions

Architecture Decision Records (ADRs). Add new entries at the bottom. Don't edit an accepted decision. Supersede it with a new one.

Template:

```
## ADR-XXX: Title
- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded by ADR-YYY
- **Context:** why a decision was needed
- **Decision:** what we chose
- **Consequences:** trade-offs and follow-ups
```

---

## ADR-001: Next.js App Router + Supabase

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** We need a full-stack web app with auth, a relational database and file storage, built quickly by a small team.
- **Decision:** Use the official Next.js + Supabase starter: Next.js App Router for the frontend and server logic, and Supabase for Postgres, Auth and Storage.
- **Consequences:** No separate backend service. Business rules live in RLS policies, Postgres functions and Server Actions. We are tied to Supabase-hosted services.

## ADR-002: `src/` directory layout

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** The starter keeps `app/`, `components/` and `lib/` at the repo root, which mixes source with config files.
- **Decision:** Move all application code into `src/` and keep the `@/*` alias pointing to `src/*`.
- **Consequences:** Config files stay at the root. Tailwind content globs only scan `src/`.

## ADR-003: Tailwind CSS + shadcn/ui

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** We need a consistent, accessible UI kit we can fully customize.
- **Decision:** Use Tailwind CSS with shadcn/ui components (copied into `src/components/ui`) and CSS-variable design tokens.
- **Consequences:** We own the component code. Theming happens through `globals.css` tokens.

## ADR-004: Authorization through Row Level Security

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** The browser talks to Supabase directly, so access control must be enforced in the database.
- **Decision:** Enable RLS on every table. Store roles in `profiles.role`. UI checks are cosmetic only.
- **Consequences:** Every new table needs policies before use. Admin checks run inside policies, through a `is_admin()` helper function.

## ADR-005: Full-scope MVP

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** The brief left payment, accounts, roles and private tours as open questions (`PROJECT_BRIEF.md` §8). Two scopes were compared: a lean MVP (booking requests confirmed manually) and a full MVP.
- **Decision:** The project owner chose the full scope: online booking and payment for group tours (VNPay + VietQR bank transfer), private and tailor-made trips through a consultation inquiry → quote → payment link, guest checkout plus optional customer accounts, a multi-role admin, and a bilingual website.
- **Consequences:** Larger MVP (about 16 weeks for one developer, see `DEVELOPMENT_PLAN.md`). Payment, seat-hold and compliance work move into the launch scope. Supersedes the "P2" placement of online payment in the original `FEATURES.md`.

## ADR-006: Bilingual website (Vietnamese and English)

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** Brief §8 asked about languages. The business targets Vietnamese and international travellers.
- **Decision:** The public website and customer emails support Vietnamese (default, no URL prefix) and English (`/en` prefix), using next-intl. Content tables have per-language translation rows with their own slug, SEO fields and publish flag. The admin UI is Vietnamese only. Prices are charged and shown in VND.
- **Consequences:** Every public page, email and content form is bilingual. Adding a language later means adding an enum value and message files.

## ADR-007: English for all project documentation, code and prompts

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** Documentation, specs and AI prompts need one working language.
- **Decision:** All documentation, specs, code, comments, commit messages, PR descriptions and prompts are written in English. User-facing UI text lives in `messages/vi.json` and `messages/en.json`.
- **Consequences:** Vietnamese appears only in UI strings, content data and localized URL segments.

## ADR-008: Modular monolith with service and repository layers

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** The full scope adds booking, payments, inquiries and notifications. Keeping all logic inside pages would not scale.
- **Decision:** One Next.js app. Business logic lives in `src/modules/<module>/` (`*.service.ts` for logic, `*.repository.ts` for data access, `*.schemas.ts` for Zod, `*.actions.ts` for Server Actions). Routes and components stay thin.
- **Consequences:** Modules call each other only through services. A module can become a separate service later without a rewrite.

## ADR-009: Multiple staff roles with MFA

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** Brief §6 requires that admins manage data "according to their assigned permissions". ADR-004 assumed one `admin` role.
- **Decision:** Roles in `profiles.role`: `customer`, `sales`, `sales_manager`, `operator`, `accountant`, `editor`, `admin`. RLS helpers `current_user_role()`, `has_role()`, `is_staff()` and `is_mfa_verified()` replace the single `is_admin()` helper (which may remain as a thin wrapper). Admin and accountant must pass TOTP MFA (`aal2`). Staff accounts are created only by admin invitation. The RLS principle of ADR-004 is unchanged.
- **Consequences:** Supersedes the single-role part of ADR-004. The permission matrix lives in `ARCHITECTURE.md`. Whether `sales_manager` may edit departure prices is still pending (see ADR-016).

## ADR-010: Schema managed with Supabase CLI SQL migrations and generated types

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** Schema, RLS policies and Postgres functions must be versioned together; an ORM connecting with elevated privileges would bypass per-user RLS.
- **Decision:** Use Supabase CLI migrations in `supabase/migrations/` as the only way to change the schema. Generate TypeScript types into `src/types/database.types.ts`. No ORM.
- **Consequences:** CI fails when generated types are stale. RLS and functions are tested with pgTAP.

## ADR-011: Money as integer VND with price snapshots

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** The draft schema used `numeric(10,2)`, which cannot hold large VND amounts and invites float arithmetic.
- **Decision:** Store money as `bigint` in dong; use `number` in TypeScript with integer-only helpers in `src/lib/money.ts`. Bookings store price lines, a tour snapshot and a cancellation-policy snapshot so later edits never change past bookings.
- **Consequences:** Supersedes the money types in the draft `DATABASE.md`.

## ADR-012: Seat holds and payment recording inside Postgres functions

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** Brief §6: never confirm without an availability check or payment proof. Concurrent bookings must not oversell.
- **Decision:** Seat holds (`reserve_and_create_payment`), payment confirmation (`confirm_payment`), hold expiry (`expire_holds`, via `pg_cron`) and cancellation run as transactional Postgres functions callable only by the service role. Payments are confirmed only from verified IPN/webhooks, idempotently (`webhook_events`), never from the browser return URL.
- **Consequences:** Booking logic is split between TypeScript (validation, pricing, state rules) and SQL (atomic changes). Both need tests.

## ADR-013: Payment providers VNPay and VietQR bank transfer

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** Vietnamese customers mainly pay by domestic cards, QR and bank transfer. Stripe does not support Vietnam-registered merchants.
- **Decision:** Launch with VNPay and VietQR bank transfer reconciled through a bank-webhook service (SePay or Casso, to be chosen). All gateways implement one `PaymentProvider` interface. MoMo and international cards come after launch.
- **Consequences:** Requires a VNPay merchant contract before launch. Bank transfers need rules for under/overpayment and wrong memos (see `ARCHITECTURE.md`).

## ADR-014: Stack additions for the full scope

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** `CLAUDE.md` rule 1 requires permission for stack changes. The full scope needs more libraries and services.
- **Decision:** Add: next-intl, Zod, React Hook Form, Tiptap, Motion (sparingly), Resend + React Email, Upstash Redis (rate limiting, redirects), Cloudflare Turnstile, Sentry, Supabase CLI, Vitest, Playwright and pgTAP. Keep npm, Tailwind CSS 3, shadcn/ui and next-themes.
- **Consequences:** Each library is added only in the phase that needs it. Anything else still needs permission.

## ADR-015: Rendering with Cache Components

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** The app runs Next.js 16 with `cacheComponents` enabled, so route segment options such as `revalidate` are not used.
- **Decision:** Public content is fetched in `"use cache"` functions tagged with `cacheTag()` and an explicit `cacheLife()`. Admin saves call `revalidateTag()` (or `updateTag()` for read-your-writes). Live data (seat availability, search results, anything reading cookies or `searchParams`) renders inside `<Suspense>` boundaries and is not cached.
- **Consequences:** Tour pages get a static shell with live availability. Dynamic APIs must always sit inside Suspense.

## ADR-016: Booking business defaults

- **Date:** 2026-11-06
- **Status:** Proposed
- **Context:** The full scope needs concrete booking rules. They can change before Phase 4 without touching the architecture.
- **Decision:** Defaults, configurable in Settings where possible:
  - Private-tour requests go through an inquiry; a booking is created only when sales sends a quote.
  - Seats are held only when the customer clicks Pay: 30 minutes for VNPay, 2 hours for bank transfer.
  - Payment arriving after the hold expired: confirm if seats remain, otherwise flag "needs attention".
  - Overdue balance: remind and flag; never auto-cancel.
  - Infants do not take a seat; at most one infant per two adults.
  - Departures have a minimum number of travellers to operate; cancelling a departure is manual.
  - VAT invoice details are collected at checkout; invoices are issued manually.
  - Cancellation policies are structured (refund % by days before departure) and snapshotted on bookings.
  - Each translation has its own publish flag; a missing translation returns 404.
  - Homepage sections are fixed in code; content is picked through "featured" flags and the `homepage` setting.
  - No passport numbers are collected on the website.
  - Destinations have a language-independent `key` used in filter URLs.
  - Pending: may `sales_manager` edit departure prices? Until decided, only `admin` can.
- **Consequences:** Implemented in Phase 4. Changing a rule later means updating this ADR, `ARCHITECTURE.md` and the affected code.

## ADR-017: Light theme on the public website

- **Date:** 2026-11-06
- **Status:** Proposed
- **Context:** Brief §8 asked whether to keep the starter's light/dark switch.
- **Decision:** The public website uses a fixed light theme with Deep Navy sections for contrast. next-themes stays installed; dark mode may be offered in the admin later.
- **Consequences:** The theme switcher is removed from the public layout in Phase 1.

## ADR-018: Hosting on Vercel Pro and Supabase Pro (Singapore)

- **Date:** 2026-11-06
- **Status:** Proposed
- **Context:** The Vercel Hobby plan forbids commercial use and limits cron jobs. Supabase Free projects pause and lack backups.
- **Decision:** Free tiers for local development; Vercel Pro and Supabase Pro in the Singapore region for staging and production, with point-in-time recovery enabled at launch.
- **Consequences:** Needs a monthly cost estimate and owner approval before staging goes live.

## ADR-019: Delivery plan in seven phases

- **Date:** 2026-11-06
- **Status:** Proposed
- **Context:** The full scope (ADR-005) replaces the original five-phase plan.
- **Decision:** Phases 0–6 as described in `DEVELOPMENT_PLAN.md`, about 16 weeks for one developer or 12–13 weeks for two.
- **Consequences:** `PROGRESS.md` tracks phases by these numbers. Non-code tracks (VNPay contract, e-commerce notification, bilingual content) start in Phase 0.

## ADR-020: Delivery workflow — branches, pull requests, review and merge

- **Date:** 2026-11-06
- **Status:** Accepted
- **Context:** Work is implemented by Claude (Claude Code) against the GitHub repository `tandeptrai98dl/my-travel-agency`, with the project owner approving scope and decisions.
- **Decision:**
  - `main` is always deployable. All work happens on short-lived branches (`feat/…`, `fix/…`, `chore/…`, `docs/…`), one task or spec slice per branch, one commit per spec step, Conventional Commits.
  - Every change reaches `main` through a pull request whose description lists each acceptance criterion as pass/fail with evidence and anything blocked by missing accounts or secrets.
  - Each pull request gets an independent review by a separate agent that did not write the code, checking it against the spec, `DATABASE.md` (RLS) and the security rules in `ARCHITECTURE.md`.
  - The owner authorises Claude to squash-merge when CI is green and the review has no unresolved critical or major findings. Changes to architecture, the database design or approved ADRs still need the owner's confirmation before implementation (`CLAUDE.md` workflow step 5).
  - At most two implementation streams run in parallel, and only one stream owns `supabase/migrations/` at a time.
  - `docs/PROGRESS.md` is updated in every pull request.
- **Consequences:** GitHub (pull requests, CI runs, commit history) is the record of what is done. Branch protection on `main` (require the CI checks) should be enabled by the owner.
