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
- **Status:** Accepted (owner, 2026-11-06)
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
  - `sales_manager` does not edit departure prices; only `admin` does (owner accepted the recommended default, 2026-11-06). Revisit with a new ADR if needed.
- **Consequences:** Implemented in Phase 4. Changing a rule later means updating this ADR, `ARCHITECTURE.md` and the affected code.

## ADR-017: Light theme on the public website

- **Date:** 2026-11-06
- **Status:** Accepted (owner, 2026-11-06)
- **Context:** Brief §8 asked whether to keep the starter's light/dark switch.
- **Decision:** The public website uses a fixed light theme with Deep Navy sections for contrast. next-themes stays installed; dark mode may be offered in the admin later.
- **Consequences:** The theme switcher is removed from the public layout in Phase 1.

## ADR-018: Hosting on Vercel Pro and Supabase Pro (Singapore)

- **Date:** 2026-11-06
- **Status:** Accepted (owner, 2026-11-06)
- **Context:** The Vercel Hobby plan forbids commercial use and limits cron jobs. Supabase Free projects pause and lack backups.
- **Decision:** Free tiers for local development; Vercel Pro and Supabase Pro in the Singapore region for staging and production, with point-in-time recovery enabled at launch.
- **Consequences:** Needs a monthly cost estimate and owner approval before staging goes live.

## ADR-019: Delivery plan in seven phases

- **Date:** 2026-11-06
- **Status:** Accepted (owner, 2026-11-06)
- **Context:** The full scope (ADR-005) replaces the original five-phase plan.
- **Decision:** Phases 0–6 as described in `DEVELOPMENT_PLAN.md`, about 16 weeks for one developer or 12–13 weeks for two.
- **Consequences:** `PROGRESS.md` tracks phases by these numbers. Non-code tracks (VNPay contract, e-commerce notification, bilingual content) start in Phase 0.

## ADR-020: Delivery workflow — branches, pull requests, review and merge

- **Date:** 2026-11-06
- **Status:** Accepted; amended by ADR-025
- **Context:** Work is implemented by Claude (Claude Code) against the GitHub repository `tandeptrai98dl/my-travel-agency`, with the project owner approving scope and decisions.
- **Decision:**
  - `main` is always deployable. All work happens on short-lived branches (`feat/…`, `fix/…`, `chore/…`, `docs/…`), one task or spec slice per branch, one commit per spec step, Conventional Commits.
  - Every change reaches `main` through a pull request whose description lists each acceptance criterion as pass/fail with evidence and anything blocked by missing accounts or secrets.
  - Each pull request gets an independent review by a separate agent that did not write the code, checking it against the spec, `DATABASE.md` (RLS) and the security rules in `ARCHITECTURE.md`.
  - The owner authorises Claude to squash-merge when CI is green and the review has no unresolved critical or major findings. Changes to architecture, the database design or approved ADRs still need the owner's confirmation before implementation (`CLAUDE.md` workflow step 5).
  - At most two implementation streams run in parallel, and only one stream owns `supabase/migrations/` at a time.
  - `docs/PROGRESS.md` is updated in every pull request.
- **Consequences:** GitHub (pull requests, CI runs, commit history) is the record of what is done. Branch protection on `main` (require the CI checks) should be enabled by the owner.

## ADR-021: Design system values and Phase 1 implementation choices

- **Date:** 2026-11-06
- **Status:** Accepted (owner allowed the recommended solutions, 2026-11-06)
- **Context:** `DESIGN_SYSTEM.md` proposed a palette and fonts pending owner confirmation, and Phase 1 needs concrete values. Two proposed colours fail WCAG AA as text on the ivory background, and the shadcn/ui registry cannot be reached from the build workspace.
- **Decision:**
  - Palette as proposed (Deep Navy `#0F1B2D`, Warm Ivory `#F7F3EC`, Champagne Gold `#C9A96E`, White, Success `#2F6B4F`, Error `#A23B3B`), with two AA adjustments for text: muted text `#726D65` (Warm Gray darkened; 4.6:1 on ivory) while `#8A847B` stays for borders and decoration, and warning text `#865A11` (5.4:1 on ivory). Gold is never used for body text on light surfaces; focus rings on light surfaces use a deeper gold `#A7823E` (3:1), and navy sections get their own tokens (including a lighter error red). Contrast pairs are unit-tested against `globals.css`.
  - Fonts: Cormorant Garamond (500–600) for display and headings, Be Vietnam Pro (400–600) for body and UI, both through `next/font` with the `latin` and `vietnamese` subsets.
  - Radius `0.25rem`; no shadows on cards; fixed light theme on the public site (ADR-017).
  - shadcn/ui primitives are added by copying the new-york component source onto the Radix packages from npm (what the CLI does), because the registry is not reachable from the workspace.
  - `partialPrefetching: true` alongside `cacheComponents`, as Next.js recommends for new projects.
  - `tailwind-merge` pinned to v2 (v3 targets Tailwind 4) and extended with the custom font sizes.
- **Consequences:** `DESIGN_SYSTEM.md` values are final. Changing a colour means updating `globals.css`, this ADR and the contrast test.

## ADR-022: Libraries for forms and accessibility checks

- **Date:** 2026-11-06
- **Status:** Accepted under the owner's standing instruction of 2026-11-06 ("allow recommended solution", no further questions); listed in the owner report so it can be reverted
- **Context:** ADR-014 approved React Hook Form, Zod and Playwright. Phase 1 step 12 wires forms to Zod and step 14 asks for automated accessibility checks, which need two small additions. The shadcn primitives also need their Radix packages.
- **Decision:**
  - `@hookform/resolvers` connects React Hook Form to Zod schemas (the standard bridge; part of the React Hook Form project).
  - `@axe-core/playwright` (dev dependency) runs axe inside the existing Playwright E2E tests in CI.
  - Radix packages for the shadcn primitives (avatar, popover, radio-group, select, separator, tabs, toast, tooltip), as ADR-021 describes. Toasts use Radix Toast rather than another toast library.
- **Consequences:** No new services. Every form follows one pattern (Zod schema → `zodResolver` → `FormField`, Zod messages as translation keys). axe runs in CI; a serious or critical violation fails the build.

## ADR-023: Image processing with sharp and direct-to-Storage uploads

- **Date:** 2026-11-06
- **Status:** Accepted under the owner's standing instruction of 2026-11-06 ("allow recommended solution"); listed in the owner report so it can be reverted
- **Context:** The media library (Phase 2) must record each image's real type, width and height and a blur placeholder (`DESIGN_SYSTEM.md` imagery, `docs/specs/phase-2-catalog-admin.md` decision 6). Originals may be up to 20 MB, but Vercel Functions accept request bodies of at most 4.5 MB.
- **Decision:**
  - Add `sharp` as a direct dependency (the same version Next.js already installs for image optimisation) to read and check images, re-encode them and render a 16 px WebP blur placeholder. Decoding is limited to 12 000 px per edge and 50 megapixels (24 for AVIF); the decoded-image cache is off and one image is processed at a time.
  - The browser uploads the original through a signed upload URL, issued by a Server Action after `requirePermission("media.manage")`, into a **private staging bucket** `media-uploads` under `pending/<user id>/`. No API role has a policy on that bucket; only the service role signs, reads and deletes there.
  - A second Server Action checks that the staged file belongs to the user, checks its real type from the first bytes (JPEG, PNG, WebP, AVIF with AV1 data; never SVG or HEIC), its size, dimensions and pixel count, then **re-encodes** it in the same format (orientation applied; EXIF, GPS and any bytes appended after the image dropped; colour profile kept). Only that clean copy is written, with the service role, to the public `media` bucket, and the row is recorded with the staff session (RLS). The staged original is deleted whether it passed or not.
  - Staff keep only read (listing) and delete rights on the `media` bucket, so nothing a browser sent is ever served publicly without passing these checks. The bucket's MIME and size limits stay as a last database-side check.
- **Consequences:** No large bodies through serverless functions. Uploaded files lose their camera metadata (privacy, smaller files); re-encoding costs a little quality (JPEG and WebP at quality 90, AVIF 70); AVIF is limited to 24 megapixels because its decoder needs about 1.7 GB at 40. Media rows can only be created in the shape the server writes (path, type and placeholder checks) and staff may change only alt text and credit. Editors can still delete public objects through the Storage API directly, which skips the in-use check; that is within their delete right, and the app always deletes through the row first. The service role is used in `src/modules/media` for Storage only, after the permission check (`ARCHITECTURE.md` "Supabase clients"). An upload abandoned between the two steps leaves a private staged object; a cleanup job removes staged objects older than a day (Phase 6). The Supabase project must allow the site's origin for Storage CORS (default: all origins).


## ADR-024: Price columns guarded by triggers; publish rules in the database

- **Date:** 2026-11-07
- **Status:** Accepted under the owner's standing instruction of 2026-11-06 ("allow recommended solution"); listed in the owner report so it can be reverted
- **Context:** ADR-016 says only admin sets prices. Until Phase 2, editors could change tour prices and terms and operators could change departure prices, because RLS works on rows, not columns (`DATABASE.md` "Known Phase 0 limits"). The PR 8 review showed that update-only guards can be got round by deleting a row and inserting it again at a new price. Decision 3 of the Phase 2 spec also asks for publish rules that the API cannot bypass.
- **Decision:**
  - `guard_tour_prices()` (before insert or update on `tours`): unless the caller is an MFA-verified admin (or the service role, or `postgres`), an insert gets `from_price = 0`, the default deposit and balance terms and the default cancellation policy, whatever it sent; an update may not change those four columns.
  - `guard_departure_prices()` (before insert or update on `departures`): a non-admin insert copies the four price columns from the tour's latest departure and fails for a tour's first departure; an update may not change them.
  - Publish rules: a published tour needs a published translation, a hero image with VI/EN alt text, and a price (a departure that is not cancelled for group tours, `from_price` above 0 for private tours); a published tour translation needs a title, summary and SEO description; a published tour cannot lose its hero or its last published translation; published destinations and travel styles need a described hero when they have one; an image used as the hero of published content keeps both alt texts.
  - Tour codes are upper-case letters, digits and hyphens (shown to customers and on bookings).
- **Consequences:** Closes the Phase 0 price limit. Seeds and tests insert tours as drafts and publish them once complete. Admin-only price editing in the UI is a convenience; the database is the rule. Changing who sets prices means a new ADR and a migration.

## ADR-025: Faster delivery — parallel streams, focused reviews, lighter ceremony

- **Date:** 2026-11-07
- **Status:** Accepted (owner, 2026-11-07: "apply all 4")
- **Context:** ADR-020 delivered one pull request at a time. Most of the elapsed time went into full second-round reviews of minor findings, CI-only E2E round trips, local visual checks of admin CRUD pages and long progress entries, while Phase 3 (public pages) does not depend on the remaining Phase 2 admin work.
- **Decision:** Amends ADR-020:
  - **Two parallel streams**, each implemented by its own agent in its own git worktree, coordinated by the main session, which reviews, merges and keeps `docs/PROGRESS.md`:
    - Stream A: the rest of Phase 2 (departures; journal, pages, reviews, redirects; settings and staff).
    - Stream B: Phase 3 public pages (Claude Design mockups first, then homepage, tour detail, destinations, static pages, tour listing).
  - **Migrations in parallel**: both streams may add migrations when they touch different tables. The coordinator assigns each stream a timestamp range, so the order is fixed. `database.types.ts` is regenerated on the branch that merges second, and CI's staleness check still applies. A migration that changes a function or table owned by the other stream waits for that stream's merge.
  - **Messages per namespace**: UI strings live in `messages/<locale>/<file>.json`, listed once in `src/i18n/messages.ts` (`MESSAGE_FILES`), so the two streams edit different files.
  - **Focused reviews**: an independent reviewer still checks every PR. Critical and major findings block the merge. Minor findings are fixed only when cheap; the rest are added to the phase backlog in `PROGRESS.md` and handled in a polish PR at the end of the phase. A re-review checks only the fix commit.
  - **Lighter ceremony**: progress entries list what was done, what was verified, deviations and review outcome in about ten lines. PR bodies keep the acceptance pass/fail table and the blockers. Local screenshot and axe checks with a faked user are done for public pages only; admin pages rely on the CI axe and E2E tests.
  - Small related slices may share one PR (for example settings and staff).
- **Consequences:** More usage per hour (each agent reads the docs on start) in exchange for shorter elapsed time. Shared files (`messages`, nav items, PROGRESS) are kept apart by the namespace split and by the coordinator owning PROGRESS. Minor findings may wait until the end of a phase.

## ADR-026: Departure rules in the database

- **Date:** 2026-11-07
- **Status:** Accepted under the owner's standing instruction of 2026-11-06 ("allow recommended solution"); listed in the owner report so it can be reverted
- **Context:** Step 16 of the Phase 2 spec limits who may cancel a departure and when, and keeps capacity at or above the reserved seats. The tours review (PR 11) found that an operator could cancel or delete every departure of a published group tour, leaving a published tour with nothing to book, although `check_tour_publishable()` refuses to publish one in that state.
- **Decision:**
  - `check_departure_change()` (before insert, update or delete on `departures`): capacity is never below `seats_reserved`; through the API only an MFA-verified admin moves a departure to or from `cancelled`, and not while it has `pending_payment` or `confirmed` bookings (Phase 4 adds cancelling with refunds and emails); for every role, the last departure that is not cancelled of a published group tour cannot be cancelled or deleted (closing it is allowed). The service role and `postgres` stay trusted for the cancel rules (Phase 4 functions), not for the last-departure rule.
  - `departure_has_open_bookings(target_id)` (security definer, staff only, false for everyone else) lets the trigger and the admin see bookings of every role.
  - Departures belong to group tours; private and archived tours take no new ones (service rule). Bulk creation skips dates the tour already has (`on conflict do nothing`) and reports them. Departure dates are not edited after creation; a wrong date is deleted (when it has no bookings) and created again.
  - Minimum travellers to operate stays a tour column (`tours.min_pax_to_operate`, edited with the tour's permission); the departure editor shows it.
- **Consequences:** To retire a published group tour's last departure, publish another one or unpublish the tour first. Phase 4's `cancel_booking()` and a future departure-cancellation function run as the service role and must keep the last-departure rule in mind.

## ADR-027: Content Security Policy per page type without nonces on prerendered routes

- **Date:** 2026-11-07
- **Status:** Accepted under the owner's standing instruction of 2026-11-06 ("allow recommended solution"); listed in the owner report so it can be reverted
- **Context:** `ARCHITECTURE.md` "Security" asked for a nonce-free CSP on cached public pages and a nonce-based CSP on checkout, account and admin. With `cacheComponents` (ADR-015) those routes are partially prerendered (the build marks `/admin/*` as ◐), and the Next.js 16 CSP guide states that Partial Prerendering is incompatible with nonces: the prerendered shell's scripts are produced at build time and cannot carry a per-request nonce.
- **Decision:**
  - Cached public pages: a static, nonce-free policy from `next.config.ts` headers (`script-src 'self' 'unsafe-inline'`, strict `object-src`, `base-uri`, `form-action`, `frame-ancestors 'none'`, host allow-lists from validated env; `upgrade-insecure-requests` only when the Supabase URL is `https:`), as in `docs/specs/phase-3-public-site.md` decision 13.
  - Admin, account and checkout: **chosen, option 2** (fully dynamic rendering with a proxy nonce), after the spike below ruled out option 1. The options as they were weighed:
    1. **Hash-based**: `experimental.sri` adds `integrity` hashes to scripts at build time, and the policy allows `'self'` plus the hashes of the shell's inline scripts instead of `'unsafe-inline'`.
    2. **Fully dynamic rendering** if hashes cannot cover the shell: the root layouts of these routes await `connection()` before rendering markup, so nothing is prerendered and the proxy's nonce applies, provided Next.js 16 accepts that under `cacheComponents`.
    3. **The public-page policy everywhere** if neither works, recorded as an edit to `ARCHITECTURE.md` "Security".
  - `/auth/*` (the starter staff sign-in pages until Phase 5) gets the public nonce-free policy: those pages are static and handle no customer data beyond the sign-in form.
  - A spike in Phase 3 PR H proves the choice on a production build (Turbopack and webpack) before PR M enforces it; E2E fails on any `securitypolicyviolation`.
- **Spike result (PR H, local webpack production build, 2026-11-07):** option 1 fails: with `experimental.sri` and `script-src 'self'`, Next.js's inline bootstrap and streamed data scripts are blocked (7–17 violations per page) and only 4–5 of 11–32 scripts get an `integrity` attribute (lazily loaded chunks have none); the streamed scripts of dynamic holes carry request data, so they cannot be hashed at build time. Option 2 works: `export const instant = false` plus `await connection()` in `src/app/admin/layout.tsx` builds under `cacheComponents` (admin routes become dynamic), every script carries the proxy's nonce with `'strict-dynamic'`, and `/admin`, `/admin/mfa` and the tour preview load with no violation. PR M ships option 2 for admin (account and checkout follow in Phases 4–5) and re-checks it on the Turbopack build in CI, which cannot run locally (Google Fonts are blocked here).
- **Consequences:** Admin pages lose their prerendered shells (option 2): every admin request renders fully on the server, which they mostly did already, being session-dependent. Account and checkout live under the shared `[locale]` root layout, whose public pages must stay prerendered, so before Phases 4–5 ship them they need their own root layout (a route group with a separate root, as admin has) or a new spike. Supersedes the "nonce-based CSP on checkout, account and admin" sentence of `ARCHITECTURE.md` "Security".

## ADR-028: Open Graph images from photos and file-convention routes

- **Date:** 2026-11-07
- **Status:** Accepted under the owner's standing instruction of 2026-11-06 ("allow recommended solution"); listed in the owner report so it can be reverted
- **Context:** `ARCHITECTURE.md` listed a dynamic `/api/og` route. A route that draws images from query parameters can be abused (free text in shared images, unbounded rendering) and is not cached with the page it belongs to.
- **Decision:** Pages with a photo use it as their Open Graph image (the translation's `og_media_id`, else the hero), as a 1200×630 cover rendition when Supabase image transformations are on. Pages without one use `src/app/[locale]/opengraph-image.tsx` (`next/og`): the brand name from settings on navy with a gold rule, generated statically per locale. Its two fonts are committed as OFL subsets with their licence file. There is no `/api/og` route.
- **Consequences:** No route renders images from user input. Changing the brand name refreshes the generated image with the `settings` tag. Tours without a photo fall back to the generated image.

## ADR-030: Journal and page rules; images inside JSON

- **Date:** 2026-11-07
- **Status:** Accepted under the owner's standing instruction of 2026-11-06 ("allow recommended solution"); listed in the owner report so it can be reverted
- **Context:** Step 18 of the Phase 2 spec adds the journal and the static pages with decision 3's publish rules, and the PR 9 known issue asked for a usage check on image ids kept inside JSON (rich text, itinerary `media_ids`), which are not foreign keys. ADR-027 to ADR-029 are reserved for stream B.
- **Decision:**
  - Rich text is stored only after `sanitizeRichText()` (decision 7) and rendered again through the same whitelist; images hold a media id, never a URL.
  - A published post or page translation needs a title, content with text or an image, and an SEO description; images in it need VI/EN alt text. A published post needs a published translation and a cover image with both alt texts (journal cards and sharing previews); a published page needs a published translation. A published item keeps its last published translation, translations cannot move to another item, and images used as covers or inside published content keep their alt texts. Checked in `content.service.ts` first and by `check_content_translation()`, `check_content_publishable()` and `keep_hero_alt()`.
  - A published article cannot be deleted (unpublish first); a topic only when no article uses it. The six page keys are fixed in code (`PAGE_KEYS`) and their rows are created on first save. A slug change on a published article, a topic or a policy page adds a 301 (decision 4); about and FAQ have fixed routes.
  - `guard_media_delete()` refuses deleting an image whose id appears in rich text (posts, pages, destinations) or in a tour itinerary, with the foreign-key error code, so the media library shows its usual "in use" message. It matches the id as text in those JSON columns, which also covers JSON shapes added later.
- **Consequences:** Public journal and page queries (stream B) read through `RichText` with a media map. A post without a cover stays a draft. The text match makes a delete scan a few JSON columns; fine at the expected content size.

## ADR-031: Reviews, redirects in Redis, subscriber exports

- **Date:** 2026-11-07
- **Status:** Accepted under the owner's standing instruction of 2026-11-06 ("allow recommended solution"); listed in the owner report so it can be reverted
- **Context:** Steps 19 and 20 of the Phase 2 spec add review moderation, redirects synced to Upstash Redis (decision 5) and a read-only subscriber list with an audited CSV export. The proxy that reads Redis comes with Phase 3 (stream B), so the stored format must be fixed now.
- **Decision:**
  - Reviews: API roles update only `status` and `is_featured`; a featured review must be approved; reviews written in by staff are never verified or linked to a booking (`*_review_rules.sql`). The customer's text is never edited.
  - Redirects: source and target are site paths (`/…`, no `//`, no spaces; sources without `?` or `#`), 301 or 302 from the admin (307/308 allowed in the table), never to themselves and never chained (a trigger refuses a target that is itself redirected and a source others point to; the admin and the slug helpers flatten first).
  - Redis holds one hash, `redirects`, with the source path as field and `{"to": "/target", "status": 301}` as value. Every create, delete and slug change updates it after the database write; "resync" rebuilds it in `redirects:resync` and swaps it in with `RENAME`. The client is a small `fetch` wrapper over the Upstash REST pipeline (`src/lib/redis.ts`), so no SDK is added. Without `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (optional in the env schema until Phase 3) every sync is a logged no-op.
  - Subscribers: the admin list is read-only; the CSV export holds only confirmed subscribers who have not unsubscribed, neutralises spreadsheet formulas, and is refused unless its `audit_logs` row (`subscribers.export`, actor, count) is written first, through the service role after the permission check.
- **Consequences:** Stream B's proxy reads `HGET redirects <path>` and must treat a miss as "no redirect". Redirects created before Upstash exists need one resync. Phase 3 makes the Upstash variables required in production.
