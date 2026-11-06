# Development Plan

Full-scope MVP (ADR-005) in seven phases (ADR-019, proposed): about 16 weeks for one developer, 12–13 weeks for two (Phase 2 in parallel with Phase 3, Phase 5 with the second half of Phase 4).
Scope comes from `PROJECT_BRIEF.md` and `FEATURES.md`. Track status in `PROGRESS.md`. Each phase ends with a deployable app on staging, checked against the Definition of Done.

Non-code tracks that can block launch start in Phase 0: VNPay merchant contract, e-commerce website notification to the Ministry of Industry and Trade, bilingual content and photography.

## Phase 0: Foundation (1.5 weeks) — spec: `docs/specs/phase-0-foundation.md`

- [x] Scaffold Next.js + Supabase starter
- [x] Move source into `src/`, add `public/`
- [x] Add `CLAUDE.md` and `docs/`
- [x] Resolve the open questions in `PROJECT_BRIEF.md` §8 (ADR-005 to ADR-019)
- [ ] Commit the `src/` restructure; fix the lint error in `tailwind.config.ts`; ignore `.next` in ESLint
- [ ] Remove the starter tutorial components and pages
- [ ] Test tooling: Vitest, Playwright, pgTAP (ADR-014)
- [ ] Environment validation with Zod; `.env.example` complete
- [ ] Supabase CLI, all base migrations from `DATABASE.md`, baseline RLS, seed data, generated types
- [ ] Auth integration: profile trigger, role guard, role helpers, staff MFA, `requireRole()`, admin client
- [ ] next-intl routing (VI default, `/en`) and pathnames
- [ ] Minimal `/admin` (role + MFA), `/api/health`, Sentry, GitHub Actions CI, Vercel previews
- [ ] Owner: create the Supabase staging project and accounts; start the non-code tracks

## Phase 1: Design system and UI shell (1.5 weeks)

- [ ] Confirm palette and fonts; apply tokens to `globals.css` and `tailwind.config.ts` (`DESIGN_SYSTEM.md`)
- [ ] Restyle shadcn primitives; add the planned primitives
- [ ] `SiteHeader`, `MegaMenu`, `MobileNav`, `SiteFooter`, `LanguageSwitcher`, `ContactFloatingButton`, `CookieConsentBanner`, 404 page; public layout with a fixed light theme (ADR-017)
- [ ] Dev-only `/admin/design-system`
- [ ] Acceptance: Lighthouse Accessibility ≥ 95; Vietnamese diacritics render correctly at every size

## Phase 2: Content and catalog admin (2.5 weeks)

- [ ] `AdminShell` by role + MFA, DataTable, LocaleTabs, RichTextEditor, MediaPicker + Supabase Storage upload
- [ ] Tours (itinerary builder, SEO, duplication), departures (bulk creation), destinations, travel styles, cancellation policies
- [ ] Journal, static pages, reviews, redirects (synced to Redis)
- [ ] Settings, staff, audit log; `revalidateTag()` on save; role-based RLS writes + pgTAP
- [ ] Acceptance: an editor publishes a full VI/EN tour without a developer; under-privileged roles are blocked on the server and by RLS

## Phase 3: Public website and SEO (2 weeks)

- [ ] Homepage
- [ ] Tour listing (`docs/specs/tour-listing.md`)
- [ ] Tour detail with live departures in `<Suspense>`
- [ ] Destinations, travel styles, journal, about, reviews, contact, FAQ, policies, site search
- [ ] Metadata, JSON-LD, sitemap, hreflang, OG images, redirects; CSP per page type
- [ ] Acceptance: Core Web Vitals "Good" on staging; Rich Results Test passes; pages without an English translation return 404

## Phase 4: Booking and payments (4 weeks)

- [ ] `pricing.ts`, `state-machine.ts`; `reserve_and_create_payment`, `confirm_payment`, `expire_holds`, `cancel_booking`, `check_seat_invariant` + pgTAP; `pg_cron` schedules
- [ ] Book-now flow with VAT invoice details, terms consent, cancellation policy summary
- [ ] VNPay adapter (sandbox); VietQR + SePay/Casso webhook; under/overpaid and wrong-memo transfers
- [ ] Private-tour quotes: inquiries + `quoted` bookings in the admin, payment links
- [ ] Emails: booking received, payment received, booking confirmed, payment link
- [ ] Admin: bookings, payments, manual recording, refunds, "needs attention" queue
- [ ] Acceptance: E2E booking + sandbox payment passes; two customers booking the last seat → only one succeeds; repeated IPN creates no duplicates; late IPN handled on both branches; seat invariant holds after the full test run

## Phase 5: Accounts, inquiries and operations (2 weeks)

- [ ] Localized sign-in/sign-up pages (replace the starter `/auth` pages for customers), `/auth/callback` for Google, account area, booking lookup
- [ ] Tailor-made wizard + Turnstile; contact form; full inquiry inbox
- [ ] Balance reminders (Vercel Cron), minimum-traveller alerts, double opt-in newsletter, dashboard, passenger CSV export
- [ ] Acceptance: sales completes inquiry → quote → customer payment → confirmed booking on staging

## Phase 6: Hardening and launch (2.5 weeks)

- [ ] Security review: RLS and service-role audit, Supabase Security Advisor clean, headers, rate limits, permission tests
- [ ] Performance, accessibility and responsive QA (Lighthouse)
- [ ] Real content, legal pages, GA4 + Consent Mode v2
- [ ] Enable PITR and rehearse a restore; VNPay production sign-off; staff UAT
- [ ] Production deployment on Vercel; two weeks of close monitoring
- [ ] Acceptance: launch checklist 100%; no critical bugs open

## After launch

P1 and P2 items in `FEATURES.md`.

## Definition of done

- Lint, type check, unit tests, `supabase db lint` and pgTAP pass
- New business logic has unit tests; money flows have E2E tests
- RLS and per-role tests for every new table or policy
- VI/EN strings for all new UI text
- Responsive on desktop, tablet and mobile; keyboard and screen-reader accessible
- Server-side permission checks on every admin action
- No hardcoded business data and no secrets in code
- `PROGRESS.md` updated, with results verified; `DECISIONS.md` updated for new decisions
