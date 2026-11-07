# Architecture

Scope: the full MVP (ADR-005). Decisions referenced as ADR-xxx live in `DECISIONS.md`.

## High-level overview

```
Customers (VI/EN)        Staff (/admin, by role)        Vercel Cron        Payment gateways
        │                         │                          │              (VNPay IPN, bank webhook)
        ▼                         ▼                          ▼                      │
Vercel edge ── src/proxy.ts: locale routing, Supabase session refresh, redirects, security headers
        │                                                                           │
        ▼                                                                           ▼
Next.js app (one deployment, modular monolith — ADR-008)
  ├── Server Components   → cached content ("use cache") + live data inside <Suspense>
  ├── Server Actions / Route Handlers → thin: session, requireRole(), Zod, call a service
  ├── src/modules/*       → services (business logic) + repositories (data access)
  └── Client Components   → filters, forms, booking widget
        │
        ▼
Supabase (Singapore)
  ├── Postgres + RLS + Postgres functions (seat holds, payments) + pg_cron
  ├── Auth (email/password, Google, TOTP MFA for staff)
  └── Storage (public media bucket, private media-uploads staging and private buckets)
Other services: Resend (email + Auth SMTP), Upstash Redis (rate limits, redirects), Sentry, Turnstile
```

## Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, `cacheComponents`), React 19 | ADR-001, ADR-015 |
| Language | TypeScript strict | |
| UI | Tailwind CSS 3, shadcn/ui (new-york), lucide-react, Motion (sparingly) | ADR-003 |
| Theming | next-themes installed; public site uses a fixed light theme | ADR-017 |
| i18n | next-intl, VI default (no prefix), EN under `/en` | ADR-006 |
| Forms & validation | React Hook Form + Zod | ADR-014 |
| Rich text | Tiptap, stored as JSON | ADR-014 |
| Backend | Supabase: Postgres, Auth, Storage, RLS | ADR-001, ADR-004 |
| Data access | `@supabase/ssr` + `supabase-js`, generated types, Postgres functions via `rpc()` | ADR-010 |
| Migrations | Supabase CLI (`supabase/migrations/`) | ADR-010 |
| Payments | VNPay; VietQR bank transfer + SePay or Casso webhook | ADR-013 |
| Email | Resend + React Email (also the SMTP for Supabase Auth) | ADR-014 |
| Rate limiting, redirects | Upstash Redis | ADR-014 |
| Spam protection | Cloudflare Turnstile | ADR-014 |
| Scheduled jobs | `pg_cron` for data jobs; Vercel Cron for jobs that need the app | ADR-012 |
| Search | Postgres `unaccent` + `pg_trgm` inside `search_tours()` | |
| Images | Uploads go straight to a private Storage staging bucket through signed URLs; `sharp` checks and re-encodes them and makes blur placeholders before the clean copy is published | ADR-023 |
| Monitoring | Sentry, Vercel Speed Insights | ADR-014 |
| Analytics | GA4 through `gtag.js`, loaded only after consent (Consent Mode v2, manual `page_view` with route templates, never on payment-link, lookup or account pages); cookie choices recorded in `cookie_consents` | ADR-039 (Phase 6) |
| Testing | Vitest (unit), Playwright (E2E), pgTAP (`supabase test db`) | ADR-014 |
| Hosting | Vercel Pro + Supabase Pro, Singapore | ADR-018 |
| Package manager | npm | |

## Folder structure

```
.
├── CLAUDE.md
├── docs/                         # this documentation; feature specs in docs/specs/
├── supabase/
│   ├── config.toml
│   ├── migrations/               # schema, RLS, Postgres functions, pg_cron schedules
│   ├── seed.sql                  # development data only
│   └── tests/                    # pgTAP tests
├── scripts/seed-users.ts         # sample staff accounts via the Auth Admin API (local only)
├── messages/{vi,en}/*.json       # UI strings, one file per area (ADR-025)
├── emails/                       # React Email templates
└── src/
    ├── app/
    │   ├── (public)/[locale]/    # public website (VI default, /en): prerendered, nonce-free CSP
    │   │   └── (site)/           # home, tours, tours/[slug], destinations, travel-styles,
    │   │                         # tailor-made, journal, about, reviews, contact, faq,
    │   │                         # policies/[slug], search, newsletter/confirm, newsletter/unsubscribe
    │   ├── (secure)/[locale]/    # own root layout, fully dynamic with a nonce CSP (ADR-027; Phase 4–5)
    │   │   ├── (booking)/        # book/[tourSlug], checkout/[code] (payment, result),
    │   │   │                     # pay/[token], booking-lookup
    │   │   ├── (auth)/           # login, register, forgot-password, reset-password
    │   │   └── account/          # overview, bookings, bookings/[code], profile
    │   ├── auth/                 # confirm (existing), callback (OAuth), error
    │   ├── admin/                # Vietnamese-only admin, role + MFA checked in layout
    │   ├── api/                  # payments/vnpay/ipn, webhooks/bank-transfer,
    │   │                         # cron/balance-reminders, cron/departure-checks,
    │   │                         # cron/health-checks, cron/housekeeping, health
    │   ├── sitemap.ts · robots.ts · not-found.tsx
    ├── modules/                  # catalog, booking, payment, inquiry, content, media,
    │                             # notification, identity, account, operations, settings, audit
    ├── components/
    │   ├── ui/                   # shadcn/ui primitives
    │   └── layout/ · marketing/ · tour/ · booking/ · account/ · admin/
    ├── lib/
    │   ├── supabase/             # client.ts, server.ts, proxy.ts (existing) + admin.ts (service role)
    │   ├── auth/                 # get-user.ts, require-role.ts, permissions.ts
    │   ├── money.ts · dates.ts · email.ts · rate-limit.ts · turnstile.ts · logger.ts
    │   ├── env/                  # schema.ts (Zod), public.ts (client-safe), server.ts (server-only, validated)
    │   └── utils.ts
    ├── i18n/                     # routing.ts, request.ts, pathnames.ts
    ├── types/database.types.ts   # generated, never edited by hand
    └── proxy.ts
```

Since Phase 5 PR 5A customers sign in on the localized pages of the secure root; staff keep the Vietnamese `/auth/login`, `/auth/forgot-password` and `/auth/update-password` (Server Actions, nonce-free public CSP), `/auth/sign-up` and `/auth/sign-up-success` redirect (308) to `/dang-ky`, and `/auth/confirm` and `/auth/callback` finish email links and Google sign-in on the server. The starter tutorial content (`src/components/tutorial/`, `src/app/protected/`) is removed in Phase 0.

**Dependency rules**: `app` → `modules` → `lib`. Components receive props and never import repositories or Supabase clients. Modules call each other through services. `lib/supabase/admin.ts` has `import 'server-only'` and is imported only in server-side `modules/*`.

## Modules

| Module | Responsibility | Depends on |
| --- | --- | --- |
| identity | Supabase Auth on the server (customer and staff sign-in, sign-up, reset, Google), profiles, roles, staff MFA | content (privacy version) |
| account | The customer account area: bookings through the customer-safe functions, travellers, profile and marketing choice; data deletion; the admin customers area (`customers-admin.*`: list, detail, notes, data export, finishing deletion requests) | identity, content |
| catalog | Tours, departures, prices, destinations, travel styles, search | media |
| booking | Pricing, seat holds, booking lifecycle, travellers | catalog, payment, notification |
| payment | Payment creation, IPN/webhooks, reconciliation, refunds | booking (via callback) |
| inquiry | Consultation requests, assignment, notes, quotes | booking, notification |
| operations | Daily jobs behind `/api/cron/*` (balance reminders, overdue and minimum-traveller alerts), the role dashboards, the passenger list export (Phase 5 PR 5D) | booking (emails) |
| content | Journal, static pages, reviews, redirects | media |
| media | Upload, image metadata, alt text | Supabase Storage |
| notification | Transactional email, send log | Resend |
| consent | Cookie-consent records (`cookie_consents`, ADR-039): the banner's and settings dialog's choices, rate-limited, through a service-role function | — |
| settings, audit | System configuration, audit log | — |

## Data flow

- **Reads**: Server Components call services; repositories use the server Supabase client (`@/lib/supabase/server`) so RLS applies to the signed-in user (or anon).
- **Writes**: Server Actions validate with Zod, call `requireRole()` when staff-only, then call a service. Atomic changes (seat holds, payments) go through Postgres functions. After writes, call `revalidateTag()` / `updateTag()` for affected cache tags.
- **Guest writes** (draft booking, inquiry, newsletter, cookie-consent records): Server Actions use the service-role client after Zod validation, Turnstile and rate limiting. anon has no direct INSERT rights.
- **Auth**: `proxy.ts` refreshes the session cookie. Layouts and actions verify the user with the Auth server (`getClaims()`/`getUser()`), never from cookie contents alone.

### Supabase clients

| Client | File | Key | Used for | RLS |
| --- | --- | --- | --- | --- |
| Browser | `lib/supabase/client.ts` | publishable | Client components reading public data (use sparingly) | Applies |
| Server session | `lib/supabase/server.ts` | publishable + session cookie | Server Components, Server Actions for customers and staff | Applies per user |
| Public (no session) | `lib/supabase/public.ts` | publishable, no cookies | Health check; public reads inside `"use cache"` functions (no user context) | Applies as anon |
| Admin | `lib/supabase/admin.ts` | secret (service role), server only | Payment webhooks, cron routes, guest writes after validation; media Storage staging and publishing after `requirePermission()` (ADR-023); staff invitations through the Auth Admin API after `requirePermission("staff.manage")` (ADR-032); the guest booking lookup and the customer deletion steps (ban, anonymise, soft delete) after the password or `requirePermission("customers.delete_data")` (Phase 5 PR 5B); the daily cron jobs after the `CRON_SECRET` check and the customer data export after `requirePermission("customers.delete_data")` (Phase 5 PR 5D); the newsletter unsubscribe tokens of the audited subscriber export after `requirePermission("newsletter.manage")` (Phase 6 PR 6P); the health check (`cron_failures()`, lapsed holds) and the staged-upload cleanup in `media-uploads` after the `CRON_SECRET` check (Phase 6 PR 6B) | Bypassed |

Staff always work through the session client so RLS is a second layer after `requireRole()`.

## Rendering and caching (ADR-015)

| Page type | Approach |
| --- | --- |
| Home, destinations, travel styles, journal, static pages | Data in `"use cache"` functions with `cacheTag()` and `cacheLife()`; refreshed by tag when admin saves |
| Tour detail | Cached content (itinerary, photos, SEO) + live departures, prices and seats inside `<Suspense>` (not cached) |
| Tour listing / search | Reads `searchParams`, so it renders inside `<Suspense>`; only the destination tree is cached |
| Checkout, account, admin | Dynamic, uncached |

## Book-now flow

1. Choosing a date, travellers and entering contact details creates a `draft` booking that **does not hold seats**. Prices are recalculated on the server; client prices are never trusted. Each submit carries an idempotency key.
2. Customer clicks Pay: `reserve_and_create_payment()` runs in one transaction — conditional seat update (`seats_reserved + n <= capacity`), booking → `pending_payment`, payment `pending` with `expires_at` (30 min VNPay, 2 h bank transfer). VNPay's `vnp_ExpireDate` equals `expires_at`.
3. Switching payment method cancels the old payment, creates a new one and recalculates the hold.
4. IPN/webhook: verify the signature, insert into `webhook_events` (unique per provider + transaction id), then `confirm_payment()` in one transaction. The return URL is display-only and never confirms payment (brief §6).
5. Payment after the booking `expired`: try to re-hold seats; if none remain, record the money, set `needs_attention`, email sales and accounting.
6. Hold expiry is checked on every booking read/write; `pg_cron` runs `expire_holds()` every 5 minutes. Cron only cleans up.
7. On confirmation: emails, `booking_events`, audit log.

Private tours: the customer sends an inquiry; sales creates a `quoted` booking with the final price and a quote expiry, then sends a payment link. Payment follows steps 2–7. Full rules: ADR-016 and `FEATURES.md`.

### Booking lifecycle

`status`: `draft` → `pending_payment` → `confirmed` → `completed`; `quoted` → `pending_payment` for private tours; terminal `cancelled` and `expired`. `payment_state` is a separate axis: `unpaid` → `deposit_paid` → `paid`, plus `partially_refunded` / `refunded`. Valid transitions are defined in `src/modules/booking/state-machine.ts`; transitions that change seats or money run in Postgres functions and write `booking_events`.

### Payment adapter

Every gateway implements `PaymentProvider`: `createPayment()`, `verifyReturn()`, `handleWebhook()`, `refund()` where supported. New gateways are new adapters; booking logic does not change.

## Authorization (ADR-004, ADR-009)

RLS is the source of truth; `requireRole()` is the first check in every Server Action, Route Handler and admin layout; UI checks only hide controls.

| Area | Sales | Operator | Accountant | Editor | Admin |
| --- | --- | --- | --- | --- | --- |
| Dashboard | Own | Operations | Finance | Content | All |
| Inquiries (leads) | Edit (assigned + unassigned) | Read | — | — | Full |
| Bookings | Create, edit, send payment links | Edit travellers, read | Read | — | Full |
| Change status / cancel | Request cancellation | Yes | — | — | Yes |
| Payments, manual recording, refunds | Read | Read | Full | — | Full |
| Tours, departures, prices | Read | Edit departures and seats | Read prices | Edit tour content | Full |
| Destinations, styles, journal, pages, reviews, media | — | — | — | Full | Full |
| Customers | Read, notes | Read | Read | — | Full, data deletion |
| Redirects, newsletter | — | — | — | Edit | Full |
| Settings, staff, audit log | — | — | — | — | Full |

`sales_manager` has the Sales permissions and, for inquiries, sees every inquiry and assigns anyone (ADR-037); everyone who reads customers (sales roles, operator, accountant, admin) also reads a customer's consent history through `customer_consents()` (purpose, granted, version, time; no IP or user agent), while `consent_records` itself stays admin-only (Phase 5 PR 5D); inquiry status, owner and first response change only through the role-checked inquiry functions (`DATABASE.md`); only Admin edits departure prices (ADR-016). Admin and accountant need MFA (`aal2`).

## Routes

Vietnamese is the default without a prefix; English uses `/en`. Folder names use English segments; Vietnamese segments are declared in next-intl `pathnames`. A page declares `hreflang` only for languages with a published translation.

| Page | VI | EN |
| --- | --- | --- |
| Home | `/` | `/en` |
| Tour listing / detail | `/tours`, `/tours/[slug]` | `/en/tours`, `/en/tours/[slug]` |
| Destinations | `/diem-den`, `/diem-den/[slug]` | `/en/destinations`, `/en/destinations/[slug]` |
| Travel styles | `/phong-cach/[slug]` | `/en/travel-styles/[slug]` |
| Tailor-made inquiry (wizard, Phase 5 PR 5W) | `/thiet-ke-rieng` | `/en/tailor-made` |
| Journal | `/journal`, `/journal/[slug]`, `/journal/chu-de/[slug]` | `/en/journal`, `/en/journal/[slug]`, `/en/journal/topics/[slug]` |
| About, reviews, contact, FAQ | `/ve-chung-toi`, `/danh-gia`, `/lien-he`, `/cau-hoi-thuong-gap` | `/en/about`, `/en/reviews`, `/en/contact`, `/en/faq` |
| Policies | `/chinh-sach/[slug]` | `/en/policies/[slug]` |
| Search | `/tim-kiem` | `/en/search` |
| Book a tour | `/dat-tour/[tourSlug]` | `/en/book/[tourSlug]` |
| Checkout | `/thanh-toan/[code]`, `…/phuong-thuc`, `…/ket-qua` | `/en/checkout/[code]`, `…/payment`, `…/result` |
| Sales payment link | `/thanh-toan/link/[token]` | `/en/pay/[token]` |
| Booking lookup (noindex; the emailed single-use link opens `/thanh-toan/[code]?access=…`) | `/tra-cuu-booking` | `/en/booking-lookup` |
| Newsletter confirmation (noindex) | `/ban-tin/xac-nhan` | `/en/newsletter/confirm` |
| Newsletter unsubscribe (noindex; single-use link from the subscriber export, acts on a button press; Phase 6 PR 6P) | `/ban-tin/huy` | `/en/newsletter/unsubscribe` |
| Customer auth | `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau` | `/en/login`, `/en/register`, `/en/forgot-password`, `/en/reset-password` |
| Account | `/tai-khoan`, `/tai-khoan/booking`, `/tai-khoan/booking/[code]`, `/tai-khoan/ho-so` | `/en/account`, `/en/account/bookings`, `/en/account/bookings/[code]`, `/en/account/profile` |

Admin routes (no prefix, not indexed): `/admin`, `/admin/bookings` (with `/admin/bookings/attention`, the "needs attention" queue, and `/admin/bookings/new`, a private-trip quote, prefilled from an inquiry with `?inquiry=<code>`), `/admin/departures`, `/admin/tours`, `/admin/destinations`, `/admin/travel-styles`, `/admin/cancellation-policies`, `/admin/inquiries` (the inbox, with `/admin/inquiries/[id]`), `/admin/customers` (with `/admin/customers/[id]`: notes, consent history, data export and deletion requests), `/admin/payments`, `/admin/journal`, `/admin/pages`, `/admin/reviews`, `/admin/media`, `/admin/redirects`, `/admin/subscribers`, `/admin/settings`, `/admin/staff`, `/admin/audit-log`, `/admin/mfa`, `/admin/design-system` (dev only).

Technical routes: `/sitemap.xml` (an index of `/sitemaps/<type>.xml`: pages, tours, destinations, travel styles, journal), `/robots.txt`, `opengraph-image` file routes (ADR-028), `/api/payments/vnpay/ipn`, `/api/webhooks/bank-transfer`, `/api/cron/balance-reminders`, `/api/cron/departure-checks`, `/api/cron/health-checks` and `/api/cron/housekeeping` (GET, `Authorization: Bearer <CRON_SECRET>` compared as SHA-256 digests in constant time, 401 otherwise and 503 without the secret; scheduled in `vercel.json`: health checks every 15 minutes, the others daily at 01:43, 01:17 and 02:29 UTC, 08:43, 08:17 and 09:29 in Vietnam; idempotent through exactly-once email keys; each run checks in with Sentry Cron Monitors and pings `CRON_HEARTBEAT_URL` on success, Phase 6 PR 6B), `/api/health`, `/api/monitoring/test-error` (POST, MFA-verified admin only; throws to test Sentry), `/auth/confirm`, `/auth/callback`.

## Security

**Payments**: confirm only from IPN/webhooks with verified signatures (HMAC for VNPay, API key for SePay/Casso); check amount, reference and status; idempotent via `webhook_events`; prices always recalculated on the server; webhook source IPs restricted by `VNPAY_IPN_ALLOWED_IPS` and `BANK_WEBHOOK_ALLOWED_IPS` (comma-separated IPv4/IPv6 CIDRs, matched against the first `x-forwarded-for` hop that Vercel sets, 403 outside; required in production for each configured gateway, or `unrestricted` where the provider publishes no addresses, an exception recorded in `docs/SECURITY_REVIEW.md`; Phase 6 PR 6A). A refused call is logged every time; one that carries a valid signature or key (VNPay: for our merchant code) is reported as one Sentry error per provider per 15 minutes, deduplicated in Upstash, because a signed VNPay set from a return URL can be replayed by anyone. The review with evidence, the role-matrix and definer-function pgTAP, the permission E2E and CI's `npm audit` and gitleaks scans: `docs/SECURITY_REVIEW.md`.

**Auth and access**: TOTP MFA for admin and accountant; staff accounts only by admin invitation; a trigger blocks `role` changes by non-admins; customers read only their own bookings (`customer_id = auth.uid()`); guests use single-use emailed lookup links. `proxy.ts` is never the only auth check.

**Supabase**: secret key only in server env vars (never `NEXT_PUBLIC_`); RLS on every table; `supabase db lint` in CI; Security Advisor clean before launch; `security definer` functions set `search_path = ''` and revoke execute from `public`, `anon`, `authenticated` unless intentionally public (e.g. `search_tours`).

**Application**: Zod on every input; no string-built SQL; Tiptap rendered from JSON through a node whitelist; CSP per page type (ADR-027; with a GA4 measurement ID the public policy, and the secure policy on book and checkout only, add `https://*.googletagmanager.com` to `script-src` and the Google Analytics and Tag Manager hosts to `connect-src` and `img-src`, ADR-039; `docs/SECURITY_REVIEW.md`): a nonce-free policy on cached public pages and `/auth/*`, and on checkout, account and admin fully dynamic rendering (root layout with `instant = false` and `connection()`) with a per-request nonce from the proxy and `'strict-dynamic'`; HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; Upstash rate limits on sign-in, sign-up, inquiries, booking lookup, booking creation and payment start; Turnstile on public forms (its script loads on the first interaction with the form; CSP allows `https://challenges.cloudflare.com` in `script-src` and `frame-src` on public pages, ADR-029); redirects read from Redis, never from the database in `proxy.ts` (`HMGET` on `redirects`, saved in the admin, and `redirects:languages`, the other-language slugs rebuilt on every content save; only paths that pass the source rules are looked up; targets re-checked with the admin's site-path rules, 301/302 only, 50 ms timeout failing open, 60 s per-instance cache; `src/lib/redirect-lookup.ts`); uploads checked for real type, size and pixel count, then re-encoded (metadata stripped) before they are public; no SVG uploads.

**Personal data and compliance** (verify with legal counsel): Vietnamese personal data rules (Decree 13/2023/ND-CP and the Personal Data Protection Law) — privacy policy, consent before collection, proof in `consent_records`, export and deletion on request; e-commerce website notification to the Ministry of Industry and Trade; company details and tour operator licence in the footer; no passport numbers on the website; audit log for bookings, payments and customer data; PITR from launch (it replaces Supabase's daily backups; restore rehearsed, ADR-040); SPF, DKIM, DMARC on the sending domain.

## SEO

- Server-rendered public pages, per-language slugs, canonical URLs, `hreflang` for published translations only, `sitemap.xml` split by type with `lastmod` (cached with the admin's tags, so unpublished pages leave it after a save), `robots.txt` blocking `/admin`, the API, staff sign-in, account, checkout, booking lookup, search and filtered listings. The other language's slug answers a real 308 (both languages' slugs are prerendered).
- JSON-LD: `TravelAgency` + `Organization`, `Product` + `Offer` for tours, `TouristTrip`/`ItemList`, `Article`, `BreadcrumbList`, `FAQPage`. `AggregateRating` only from verified reviews (P1).
- Automatic 301 on slug change; Metadata API on every public page; Open Graph images from photos or generated per locale (ADR-028).
- Metadata in `<head>` for crawlers (ADR-041): pages that read `searchParams` (`/tours`, `/tim-kiem`) stream their metadata after the shell, which would put the canonical, hreflang and `noindex` in `<body>`, where Google ignores a `rel=canonical`. `htmlLimitedBots` in `next.config.ts` (`src/lib/html-limited-bots.ts`) is Next.js's default bot pattern plus `Googlebot` and `Google-InspectionTool`, so those requests get blocking metadata in `<head>`. The cost: a matching request skips the prerendered shell and renders on the server on every public page, about 30 ms instead of about 4 ms per request (measured locally). The copied default is unit-tested against the installed Next.js, so an upgrade that changes it fails CI.
- Search Console for both languages; GA4 events `view_item_list`, `view_item`, `begin_checkout`, `purchase`, `generate_lead`.
- Analytics (Phase 6 PR 6P, ADR-039; off without `NEXT_PUBLIC_GA_MEASUREMENT_ID`): `CookieConsent` mounts `Analytics` (`src/components/analytics/`), which imports the gtag loader only once "analytics" is granted. Consent Mode v2: all four signals default to denied with `ads_data_redaction`, `update` grants `analytics_storage` (the `ad_*` signals only with "marketing"), then `config` with `send_page_view: false` and gtag.js loads (with the request nonce on secure pages). `page_view` is sent by hand with `page_location` = origin + route template from `pathnames` (`/checkout/[code]/result`; unknown paths `/404`), `page_referrer` reduced to another site's origin or this site's template, and `page_title` replaced by the template on routes with a code or token. GA is never loaded on `/pay/[token]`, the booking lookup, the account, customer sign-in, the newsletter confirmation and unsubscribe pages, or any page with an `access` query (the emailed-link redeem page), nor in a document first opened on one of those routes except the `access` page (a deliberate rule: it stays off after any client-side navigation, also from the public newsletter pages, whose policy allows Google; a document opened on the emailed link may start GA once its button has replaced the URL with the checkout without the token). Events come from `events.ts` (catalog facts only; `purchase` carries an HMAC of the booking code as `transaction_id`, sent once per booking, deduplicated in `localStorage`), and `scrubParams()` drops any value that looks like a code, an address, a phone number, a UUID or a token. Withdrawal updates every signal to denied, sets `ga-disable-<id>`, sends nothing more and deletes the `_ga*` cookies. Enhanced measurement must stay off in the GA4 data stream (README).

## Performance

| Metric (mobile, p75) | Target |
| --- | --- |
| LCP | < 2.5 s |
| INP | < 200 ms |
| CLS | < 0.1 |
| Initial JS on public pages | < 150 KB gzip |
| TTFB on cached pages | < 300 ms from Vietnam |

Server Components by default; images as `<img>` with next/image's `fill` attributes built on the server (`fillImageAttributes()`: Supabase image-transformation `srcset`, correct `sizes`, WebP/AVIF from Supabase, blur placeholders) and no `next/image` client code; no next-intl client provider or tailwind-merge in public client components (ADR-029); fonts via `next/font` with only the needed subsets; third-party scripts after interaction or consent; indexes for every filter query; listing queries in one Postgres function call.

## Scalability

Comfortably serves tens of thousands of visits per day and a few thousand bookings per year. Upgrade only on real signals: slow search or > 500 tours → `tour_search_summary` table or Meilisearch; sustained database load → larger Supabase compute or a read replica; multi-step jobs → Inngest/Trigger.dev; high image bandwidth → CDN in front of Storage or R2; mobile app/partners → versioned `/api/v1` reusing services; more languages → new `locale` enum value + message files.

## Monitoring

Phase 6 PR 6B (`docs/specs/phase-6-hardening-launch.md` decisions 3 and 4; runbooks in `README.md`):

- **Errors**: Sentry, with each event tagged with its release (the commit SHA of the Vercel build; source maps uploaded with it). IPN and webhook problems are sent as events tagged `payment.webhook` (provider) and `payment.event`, without references, amounts or payloads; bad signatures and unauthorized webhook calls are warnings sampled at 10 % while no source allow-list is enforced (anyone can repeat them), and unsampled errors from a listed address; calls from outside an enforced allow-list are logged, and those carrying valid credentials are one error per provider per 15 minutes (Upstash-deduplicated; a sampled warning without Upstash; Phase 6 PR 6A). The alert rules (new issue, spike, payments, scheduled jobs, Cron Monitors) are created by the owner in Sentry, as listed in `README.md` "Deployment".
- **Scheduled database jobs**: `/api/cron/health-checks` (Vercel Cron, every 15 minutes) reads `cron_failures()`: every failed `pg_cron` run of the last day and every job overdue by the missed-run rule (3 intervals for jobs every few minutes or hourly, 26 hours for daily ones). Each is reported once to `settings.contact.email` (key `cron_failure:<job>:<start>` or `cron_missed:<job>:<last success>`, ADR-036; not claimed while the address is empty), in at most one email per job per check that lists its runs and claims all their keys, so a job failing every 5 minutes cannot drain the Resend quota; each such email is also sent to Sentry with tags `cron.job` and `cron.kind`. The alert jobs (`booking-seat-invariant-alert`, `email-problems-alert`) fail on purpose, so their failed run is the signal. The same check refreshes the `tours` cache tag when held seats lapsed in `pg_cron`.
- **Vercel Cron itself**: every `/api/cron/*` run checks in with Sentry Cron Monitors (`cron-<job>`, with its schedule from `src/modules/operations/cron-jobs.ts`, kept equal to `vercel.json` by a unit test) and, on success, pings `CRON_HEARTBEAT_URL` (the uptime monitor's heartbeat); a late check-in or ping alerts.
- **Uptime**: the owner's monitor calls `/api/health` every minute; two consecutive failures page the on-call person.
- **Housekeeping**: daily `pg_cron` jobs remove access tokens 30 days after use or expiry, trim webhook payloads after 400 days only where they are copied into `payments.raw_response` (never `unmatched` or error rows), and purge `cron.job_run_details` after 30 days; `/api/cron/housekeeping` removes staged uploads older than 24 hours from `media-uploads` through the Storage API. Nothing else is deleted on a timer.
- **Logs**: structured JSON lines with the booking code, never card data, passwords, tokens, payloads or addresses; cron answers and logs carry counts only.

## Environments

| Env | URL | Supabase project | Other services | Migrations |
| --- | --- | --- | --- | --- |
| Local | http://localhost:3000 | `supabase start` (Docker) | none needed (off modes) | `supabase db reset` (with the development seed) |
| CI | http://localhost:3000 | `supabase start` in the job | fakes only (VNPay stub, fake Sentry DSN and GA4 ID) | `supabase db reset`, pgTAP, type check |
| Preview / staging | Vercel preview URLs (`VERCEL_ENV=preview`) | Staging project (Singapore) | staging Upstash, VNPay sandbox, test-mode keys; never a production value | "Database migrations" workflow, target `staging` |
| Production | > TODO (domain) (`VERCEL_ENV=production`) | Production project (Singapore, PITR add-on) | production keys only | "Database migrations" workflow, target `production`, approved by an admin; never the seed |

Deployment pipeline (Phase 6 PR 6C, ADR-040; runbooks in `README.md` "Deploy to production", "Restore from backup", "Rotate a secret"):

- **Migrations** reach hosted projects only through `.github/workflows/db-migrate.yml`: manual dispatch from `main`, the target's GitHub environment (both limited to `main`, which is the real guard; `production` with required reviewers), a token scoped to that one project and a check of the project's name against the environment's `EXPECTED_PROJECT_NAME`, a PITR check through the Supabase Management API (production refuses without it) and the restore point in the run summary, the migration list in the summary (nothing uploaded: the repository and its logs are public), a dry run, `db push`, then the remote `public` types compared with `src/types/database.types.ts` (types only, not policies or function bodies).
- **Release order:** production domains are not auto-assigned in Vercel, so a `main` build is staged; migrations run on staging, then production, the deployment is rebuilt if the release had migrations, then promoted. A changed production variable likewise needs a redeploy **and** a promotion. Migrations stay backward compatible with the live code, so a code rollback (Instant Rollback) never needs a database rollback.
- **Environment guards** (`src/lib/env/deployment.ts`, at server start and in Vercel builds): `STAGING_HOSTS` and `PRODUCTION_HOSTS` are set in every Vercel environment. Production needs both, refuses staging hosts, needs its Supabase and Upstash hosts in `PRODUCTION_HOSTS` and an https site URL, and refuses dev-only switches and test keys (`SHOW_DESIGN_SYSTEM`, `VNPAY_STUB`, CI's GA4 ID, Turnstile test keys, `E2E_*`/`SEED_*`, VNPay keys with the sandbox gateway). Previews refuse production hosts and VNPay's production gateway. A legacy JWT key must belong to its URL's project everywhere.
- **Backups:** PITR on production (it replaces Supabase's daily backups; WAL archived about every two minutes). It lives inside the project, so there is no copy outside Supabase; the owner accepts that at launch (ADR-040). A restore goes to a new project first ("Restore to a New Project"), checked through a preview and `scripts/restore-check.sql`. Storage objects are outside database backups: `media` is re-uploaded from the owner's originals, `private` is empty until P1.
