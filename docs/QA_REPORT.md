# QA report

Performance, accessibility and responsive QA for launch (`docs/specs/phase-6-hardening-launch.md` decision 5). Security findings live in `docs/SECURITY_REVIEW.md`.

- **Stream B:** public pages.
- **Stream A:** admin and secure pages (checkout, account).

The launch targets apply to the staging run with real content:

| Category | Target |
| --- | --- |
| Performance | ≥ 90 |
| Accessibility | ≥ 95 |
| Best Practices | ≥ 95 |
| SEO | 100 |

## Local pre-staging pass (2026-11-07, Stream B)

This pass ran before staging and real content existed, to find code problems early. Its scores are **not** the launch evidence. Lighthouse runs again on staging (see "Re-check on staging").

### Setup

| Item | Version or detail |
| --- | --- |
| Lighthouse | 13.5.0, run once with `npx lighthouse@13.5.0`; not a project dependency. Default mobile preset: Moto G Power emulation, simulated slow 4G, 4× CPU |
| Browser | Chrome for Testing 153.0.8010.12 (the Playwright Chromium build 1243, passed as `CHROME_PATH`) |
| Test runner | Playwright 1.65.0, used for the keyboard and responsive scripts and the new E2E specs |
| App | Next.js 16.4.5, local Turbopack production build (`next build` + `next start`). Initial JS: `/tours` 149 KB, home 146.5 KB (budget 150 KB) |
| Data | A local stub of the PostgREST reads with sample tours, destinations, articles and settings (the seed's slugs). No Supabase, so no bookings, sessions or Turnstile |

The setup differs from production in four ways that affect the numbers:

- **Fonts:** Google Fonts is blocked in the build workspace. The build swaps `next/font/google` for `next/font/local` copies of the same families, so font loading and metrics differ slightly from production.
- **Images:** photos are generated 1600×1067 JPEGs served without Supabase image transformations. LCP images are therefore heavier than they will be with transformations on.
- **Machine:** the machine is shared, so Performance moves by up to ±15 points between runs of the same page. The table gives the range over 2–6 runs.
- **Checkout:** the stub has no bookings, so checkout renders its not-found state.

### Scores (Lighthouse mobile, after the fixes below)

| Page | Perf | A11y | BP | SEO | LCP | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| Home `/` | 89–99 | 100 | 100 | 100 | 1.9–3.1 s | 0 |
| Home `/en` | 95–99 | 100 | 100 | 100 | 1.9–2.3 s | 0 |
| Listing `/tours` | 62–87 → 81 | 100 | 100 | **92** | 3.5–4.1 s | 0.373 → **0** |
| Listing `/en/tours` | 63–84 | 100 | 100 | **92** | 3.5–3.8 s | 0.373 → **0** |
| Tour `/tours/du-thuyen-vinh-ha-long` | 81–91 | 100 | 100 | 100 | 2.8–3.6 s | 0 |
| Tour `/en/tours/ha-long-bay-cruise` | 99 | 100 | 100 | 100 | 1.8–2.0 s | 0 |
| Destination `/diem-den/viet-nam` | 84–91 | 100 | 100 | 100 | 2.6–3.1 s | 0 |
| Destination `/en/destinations/vietnam` | 85–88 | 100 | 100 | 100 | 2.8–3.0 s | 0 |
| Journal `/journal` | 83–91 | 100 | 100 | 100 | 2.3–3.4 s | 0 |
| Journal `/en/journal` | 91 | 100 | 100 | 100 | 3.3 s | 0 |
| Article `/journal/mot-ngay-tren-vinh-lan-ha` | 88–95 | 100 | 100 | 100 | 2.6–3.1 s | 0 |
| Wizard `/thiet-ke-rieng` | 81–99 | 100 | 100 | 100 | 1.7–3.2 s | 0.061 → **0** |
| Wizard `/en/tailor-made` | 88–91 | 100 | 100 | 100 | 3.1–3.3 s | 0.065 → **0** |
| Contact `/lien-he` | 89–90 | 100 | 100 | 100 | 3.1–3.4 s | 0 |
| Contact `/en/contact` | 73–89 | 100 | 100 | 100 | 3.0–3.6 s | 0 |
| Book `/dat-tour/du-thuyen-vinh-ha-long` (secure) | 81–87 | 100 | 100 | 54¹ | 3.9–4.3 s | 0–0.107² |
| Checkout `/thanh-toan/PTA-…` (secure, not-found state) | 75–87 | 100 | 100 | 54¹ | 3.4–3.8 s | 0–0.039² |
| Account `/tai-khoan` (secure; ends on sign-in) | 46–82 | 100 | 100 | 54¹ | 4.4–5.0 s | 0–0.573² |
| Sign-in `/dang-nhap` (secure) | 83–87 | 100 | 100 | 54¹ | 3.6–3.7 s | 0–0.053² |

¹ The secure pages are `noindex` and robots-blocked on purpose, so a low SEO score there is expected.
² Stream A, see "For Stream A" below.

**Summary:**

- Accessibility and Best Practices are 100 on every page.
- SEO is 100 on every public page except the listing.
- Performance passes on most pages even with uncompressed photos. LCP is the limiting metric.

### Fixed in this PR

| Problem | Where | Fix | Commit |
| --- | --- | --- | --- |
| Listing below lg: the no-JS filter column painted first, then the results jumped up when hydration hid it (mobile CLS 0.373 in 3 of 5 runs) | `src/app/globals.css` | Column hidden from the first paint with `@media (scripting: enabled)`; `[data-js]` stays for older browsers | `5e1909b` |
| Wizard: the step list was added at hydration and pushed the form down (CLS 0.061–0.065) | `tailor-made-wizard.tsx` | List rendered on the server; later steps hidden from the first paint the same way. Without JS every step still shows | `5e1909b` |
| Header at 1024 px: every Vietnamese nav label, the brand and the language links wrapped onto two lines (the row needs about 1 170 px) | `site-header.tsx`, public layout | Desktop nav from `xl`; the menu sheet below. The breakpoint now lives in `SiteHeader` for both root layouts | `934bed6` |
| From md, the floating contact buttons covered the footer's "English" link and its focus ring at the end of every public page (WCAG 2.2 2.4.11) | `site-footer.tsx` | The footer's bottom row ends 96 px from the edge | `934bed6` |
| Tour gallery: Escape closed the lightbox but focus fell to `<body>` (no Radix trigger) | `gallery-lightbox.tsx`, `gallery-button.tsx` | `onCloseAutoFocus` returns focus to "View N photos" | `934bed6` |
| Booking box at 360 px: "Gọi +84 24 0000 / 0000 để đặt chỗ" broke the phone number across lines | `booking-box.tsx` | Non-breaking spaces in the number | `934bed6` |

None of these fixes adds client JavaScript. The budget check gives the same figures before and after.

### Keyboard pass

The pass was keyboard-only and scripted with Playwright: Tab and Shift+Tab, Enter, Space, Escape and the arrow keys. Widths were 375, 768, 1024, 1280 and 1440 px.

For every Tab stop, the script checked three things:

- a visible indicator (outline, or ring box-shadow on the element or its card label);
- nothing covering the element's centre;
- the walk reaching the footer, with no trap.

| Area | Result |
| --- | --- |
| Skip link, header, mega menu, language links | Pass (existing E2E in `shell.spec.ts` and `a11y.spec.ts`) |
| Cookie banner and settings dialog (Escape returns focus) | Pass (existing E2E) |
| Mobile menu sheet (Escape returns focus) | Pass at 375 px (existing E2E), 768 px (existing E2E) and 1024 px (checked) |
| Listing filter sheet (native modal `<dialog>`) | Pass. Focus stays in the dialog; past its last control focus goes to the browser UI, as a native modal does; Escape returns focus to "Filters" |
| Tour gallery lightbox | **Fixed** (Escape lost focus); now Enter opens it, focus is trapped, the arrows change photo, Escape returns focus. Checked with a local script only: the seed has no gallery photos and the tour page is cached, so an E2E test cannot add some |
| FAQ (`<details>`) | Pass (Enter toggles) |
| Tab walk on 13 pages (public and secure) at 1280 px, 7 at 375 px and 8 at 1024 px | Pass after the footer fix. Every stop shows a ring; nothing is covered; no traps |
| Customer sign-in | Order is email → password → "Đăng nhập" → forgot password → create account. Signing in with Enter is in the new E2E (runs in CI) |
| Booking form | Order is checked locally up to the first step. The full keyboard-only flow (steppers with Space, contact fields, plan with the arrows, terms with Space, Enter) is in the new E2E (CI only: it needs the database and the VNPay stub) |
| Wizard, contact form, newsletter | Focus order checked. Filling in and sending wait for staging: the forms stay disabled without Turnstile, Upstash and Resend keys |

New E2E: `tests/e2e/keyboard.spec.ts` covers:

- the Tab walk over eight public pages at 1280 and 1024 px;
- sign-in;
- the booking form.

### Responsive pass

Widths were 360, 375, 768, 1024, 1280 and 1440 px, in Vietnamese and English. Pages were home, listing, two tours (group and private), destinations, a destination, journal, an article, wizard, contact, book, checkout and sign-in.

Each page was checked for:

- horizontal overflow;
- elements past either edge;
- clipped text (overflow hidden or line clamp);
- headings with a line height below 1.15 (stacked diacritics);
- overlaps of fixed UI.

Full-page screenshots at device scale 1 were reviewed by eye. They are kept in the scratchpad, not in the repository.

| Check | Result |
| --- | --- |
| Horizontal scroll | None on any page or width (the only element off-screen is the honeypot field, by design) |
| Clipped diacritics, tight headings | None found |
| Header at 1024 px | **Fixed** (see above) |
| Footer under the floating buttons | **Fixed** (see above) |
| Phone number wrapping in the booking box | **Fixed** (see above) |

New E2E: `tests/e2e/responsive.spec.ts` covers:

- no sideways scroll on 21 public pages at 360 px, in both languages;
- the header breakpoint at 1024 and 1280 px, with the brand on one line.

### Re-check on staging

1. **Lighthouse with real content and Supabase transformations:** every page above. LCP comes mostly from 1600 px JPEGs, which staging will serve as resized WebP or AVIF. A 170 ms render-blocking CSS file and the main-thread JS (TBT 100–400 ms simulated) remain. Field data comes from Speed Insights.
2. **Listing SEO 92: metadata streamed into `<body>`.** `/tours` (and `/tim-kiem`) read `searchParams`, so Next.js 16 streams their metadata after the shell for browsers. Googlebot was not in Next's `htmlLimitedBots` list (Bingbot and Lighthouse's own UA are), so the description, canonical, hreflang and the filtered pages' `noindex` sat in `<body>`, where Google ignores a `rel=canonical`.
   - **Decided (option a, ADR-041):** `htmlLimitedBots` is Next's default pattern plus `Googlebot|Google-InspectionTool` (`src/lib/html-limited-bots.ts`). Googlebot now gets blocking metadata in `<head>`; each Googlebot request renders on the server (about 30 ms instead of about 4 ms locally).
   - **Re-check:** URL Inspection on staging shows the canonical in `<head>` for `/tours` (and for `/tours?page=2`).
3. **Status codes after a content save** (the Next.js 16.4.5 issue in `docs/specs/phase-3-public-site.md` step 22): save a tour in the admin, then:
   - `curl -I` a URL in a language where it has no published translation (for example `/en/tours/<vi-only slug>`): expect `404` (the first request after the save may get the `noindex` 200 shell once; the second must be a 404);
   - `curl -I` the other language's slug (for example `/en/tours/<vi slug>`): expect `301` with `Location`, answered by the proxy from the Redis hash `redirects:languages` (Upstash configured).
4. **Fonts and diacritics with the real Google-hosted fonts** at every size, on staging.
5. **Images on 360 px phones:** the floating contact buttons overlap the right 32 px of content while scrolling. That is normal for floating buttons, and the Tab walk found no focused element hidden. Check on real devices.

### For Stream A (secure pages; not changed here)

- **Footer layout shift on secure pages:** CLS 0.039 on checkout, 0.053 on sign-in and up to 0.107 on book. The culprit is `body.flex > footer`. The footer starts inside the first viewport and moves down as the streamed main content arrives. A `min-h` on `<main>` that keeps the footer below the fold should remove it.
- **Signed-out `/tai-khoan`:** the redirect to sign-in is streamed and then done on the client. Lighthouse counts about 3.8 s for it, and CLS 0.573 in two of three runs during the switch.
- **Book page log:** each request to `/[locale]/book/[tourSlug]` logs "Next.js encountered the unstable value `new Date()` while prerendering" from `src/lib/dates.ts`.
- **SEO 54 on secure pages:** expected (`noindex`, no meta description).

### Known limitation (pre-existing, low priority)

- **Listing without JavaScript:** the listing's results never appear when JavaScript is off. React streams the Suspense content into a hidden `<div>`, and an inline script reveals it. The filter column's "works without JavaScript" holds for the form only.

### Manual items (owner or staff)

- **Screen readers on the booking flow, the wizard, the menus, the cookie banner and dialogs, and sign-in, in both languages:**
  - VoiceOver on iOS Safari;
  - NVDA on Windows Firefox.
- **Real devices:** one recent iPhone and one mid-range Android, with the longest Vietnamese and English content.
- **Other checks:**
  - 200 % zoom and WCAG text-spacing overrides;
  - `prefers-reduced-motion`;
  - Windows forced colours (high contrast).
- **Lighthouse on staging with real content:** results attached to PR 6Q; a page that misses gets a fix or an issue the owner accepts.
- **Rich Results Test:** a tour, an article, the FAQ and the home page.
