# TASK-P1-01: Design system and UI shell

Phase 1 of `DEVELOPMENT_PLAN.md`. Builds the visual foundation every later page uses. No business features.

## Inputs

- `DESIGN_SYSTEM.md` (values approved in ADR-021), ADR-017 (fixed light theme), `ARCHITECTURE.md` (routes, performance budget, security headers), `PROJECT_BRIEF.md` §5.
- Business data shown in the shell (company details, contacts, destinations) comes from Supabase (`settings`, `destinations`), never from code (CLAUDE.md rule 8).

## Steps

One pull request per group, one commit per step.

### PR A — Tokens, fonts, primitives

1. **Tokens**: palette and semantic tokens in `src/app/globals.css` (HSL CSS variables) and `tailwind.config.ts` (`success`, `warning`, `navy`, `ivory`, `gold` extras; serif/sans font families; type scale; `--radius: 0.25rem`). Remove the `.dark` block from the public theme (ADR-017). Unit test: every text/background token pair used by components meets WCAG AA (4.5:1 normal text, 3:1 large text and UI parts), read from `globals.css`.
2. **Fonts**: `next/font/google` Cormorant Garamond (500, 600) and Be Vietnam Pro (400, 500, 600), `latin` + `vietnamese` subsets, `display: swap`, exposed as CSS variables; used by all three root layouts.
3. **Restyle existing primitives** (button, badge, card, checkbox, dropdown-menu, input, label): sharp radius, no shadows, gold focus ring, sizes from the design system; button variants `default` (navy), `secondary`, `outline`, `ghost`, `link`, `destructive`, `gold` (navy text on gold).
4. **Typography and layout components** (`src/components/typography`, `src/components/layout`): `Heading` (display, h1–h4 with responsive sizes and line-height ≥ 1.15), `Eyebrow`, `SectionHeading`, `Prose` placeholder, `Price` (VND via `src/lib/money.ts`), `Container`, `Section` (ivory / white / navy tones). `src/lib/money.ts` with integer-only helpers and unit tests.

### PR B — Public layout shell

5. **Data**: `src/modules/settings` (cached public settings: `company`, `contact`, `social`) and `src/modules/catalog/destinations` (cached published destination tree per locale), both with `"use cache"`, `cacheTag()` and `cacheLife()` on the public client.
6. **SiteHeader**: logo text from `settings.company.name`, primary navigation (Tours, Destinations, Travel styles, Tailor-made, Journal, About, Contact), transparent over a hero and solid on scroll, skip link, `LanguageSwitcher`. **MegaMenu** for destinations (countries → regions → cities) from the cached tree. **MobileNav** in a `Sheet` with focus trap.
7. **SiteFooter**: company details, licence and e-commerce notification placeholders from settings (rendered only when set), contact, social, policy links, newsletter placeholder, language switcher.
8. **ContactFloatingButton**: Zalo, WhatsApp and hotline from `settings.contact` (each shown only when set), keyboard accessible, hidden while the cookie banner is open on small screens.
9. **CookieConsentBanner**: essential-only by default; accept all / reject non-essential / settings; choice stored in a first-party cookie (`consent`, 12 months) and exposed for GA4 Consent Mode v2 (Phase 3/6); no third-party scripts before consent.
10. **404**: designed localized not-found page with links to tours and contact.
11. Public layout composes header, `<main id="main">`, footer, floating button and consent banner; fixed light theme; theme switcher not rendered.

### PR C — Remaining primitives and review page

12. Add the planned primitives used by Phases 2–5 (Dialog, Sheet, Accordion and Switch already arrived with PR B): Textarea, Select, RadioGroup, Tooltip, Popover, Tabs, Skeleton, Spinner, Toast (sonner-free: Radix Toast), Alert, Separator, Avatar, Pagination, IconButton, FormField (React Hook Form + Zod wiring), Tag, StatusBadge, EmptyState. DatePicker, Combobox, PhoneInput and Stepper arrive with the forms that need them (Phases 2 and 4).
13. `/admin/design-system` (dev only: 404 in production unless the server-only `SHOW_DESIGN_SYSTEM=true`; staff only): every token, type style with Vietnamese diacritics (ặ ẫ ỡ ự ở) at every size, and every component state.
14. Accessibility checks in CI: axe (via `@axe-core/playwright`) on `/`, `/en`, a 404 page and `/admin/design-system` with no serious or critical violations; keyboard navigation of header, mega menu, mobile nav and consent banner.

## Acceptance criteria

- [x] Tokens and fonts applied; the public site has no dark theme or theme switcher
- [x] Contrast unit test passes for every token pair; gold never used as body text on light surfaces
- [x] Vietnamese diacritics render without clipping at every type size (design-system page, visual check with the real fonts; re-check on the first Vercel preview)
- [x] Header, mega menu, mobile nav, footer, language switcher, floating contact button, cookie banner and 404 work on 375 px, 768 px and 1280 px
- [x] Company and contact details come from `settings`; destinations from the database; nothing hard-coded
- [x] Keyboard: skip link, visible focus, menu and sheet operable and closable with Escape
- [x] axe: no serious or critical violations on the checked pages (Lighthouse Accessibility ≥ 95 equivalent; Lighthouse itself on the first Vercel preview)
- [x] Initial JS on public pages measured and reported (budget 150 KB gzip; over budget, tracked in `PROGRESS.md`)
- [x] VI/EN strings for every new UI text (key parity unit-tested in `src/i18n/messages.test.ts`); `PROGRESS.md` updated

## Out of scope

Page content (Phase 3), admin CRUD (Phase 2), GA4 itself (Phase 3/6), newsletter sign-up logic (Phase 5).
