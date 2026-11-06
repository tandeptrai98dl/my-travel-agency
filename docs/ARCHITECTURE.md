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
| Analytics | GA4 via GTM with Consent Mode v2 | |
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
    │   │                         # policies/[slug], search, newsletter/confirm
    │   ├── (secure)/[locale]/    # own root layout, fully dynamic with a nonce CSP (ADR-027; Phase 4–5)
    │   │   ├── (booking)/        # book/[tourSlug], checkout/[code] (payment, result),
    │   │   │                     # pay/[token], booking-lookup
    │   │   ├── (auth)/           # login, register, forgot-password, reset-password
    │   │   └── account/          # overview, bookings, profile
    │   ├── auth/                 # confirm (existing), callback (OAuth), error
    │   ├── admin/                # Vietnamese-only admin, role + MFA checked in layout
    │   ├── api/                  # payments/vnpay/ipn, webhooks/bank-transfer,
    │   │                         # cron/balance-reminders, tours/[id]/departures, health
    │   ├── sitemap.ts · robots.ts · not-found.tsx
    ├── modules/                  # catalog, booking, payment, inquiry, content, media,
    │                             # notification, identity, settings, audit
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

The starter's `/auth/*` pages stay usable for staff until the localized customer auth pages land in Phase 5. The starter tutorial content (`src/components/tutorial/`, `src/app/protected/`) is removed in Phase 0.

**Dependency rules**: `app` → `modules` → `lib`. Components receive props and never import repositories or Supabase clients. Modules call each other through services. `lib/supabase/admin.ts` has `import 'server-only'` and is imported only in server-side `modules/*`.

## Modules

| Module | Responsibility | Depends on |
| --- | --- | --- |
| identity | Supabase Auth, profiles, roles, staff MFA | — |
| catalog | Tours, departures, prices, destinations, travel styles, search | media |
| booking | Pricing, seat holds, booking lifecycle, travellers | catalog, payment, notification |
| payment | Payment creation, IPN/webhooks, reconciliation, refunds | booking (via callback) |
| inquiry | Consultation requests, assignment, notes, quotes | booking, notification |
| content | Journal, static pages, reviews, redirects | media |
| media | Upload, image metadata, alt text | Supabase Storage |
| notification | Transactional email, send log | Resend |
| settings, audit | System configuration, audit log | — |

## Data flow

- **Reads**: Server Components call services; repositories use the server Supabase client (`@/lib/supabase/server`) so RLS applies to the signed-in user (or anon).
- **Writes**: Server Actions validate with Zod, call `requireRole()` when staff-only, then call a service. Atomic changes (seat holds, payments) go through Postgres functions. After writes, call `revalidateTag()` / `updateTag()` for affected cache tags.
- **Guest writes** (draft booking, inquiry, newsletter): Server Actions use the service-role client after Zod validation, Turnstile and rate limiting. anon has no direct INSERT rights.
- **Auth**: `proxy.ts` refreshes the session cookie. Layouts and actions verify the user with the Auth server (`getClaims()`/`getUser()`), never from cookie contents alone.

### Supabase clients

| Client | File | Key | Used for | RLS |
| --- | --- | --- | --- | --- |
| Browser | `lib/supabase/client.ts` | publishable | Client components reading public data (use sparingly) | Applies |
| Server session | `lib/supabase/server.ts` | publishable + session cookie | Server Components, Server Actions for customers and staff | Applies per user |
| Public (no session) | `lib/supabase/public.ts` | publishable, no cookies | Health check; public reads inside `"use cache"` functions (no user context) | Applies as anon |
| Admin | `lib/supabase/admin.ts` | secret (service role), server only | Payment webhooks, cron routes, guest writes after validation; media Storage staging and publishing after `requirePermission()` (ADR-023); staff invitations through the Auth Admin API after `requirePermission("staff.manage")` (ADR-032) | Bypassed |

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

`sales_manager` has the Sales permissions; only Admin edits departure prices (ADR-016). Admin and accountant need MFA (`aal2`).

## Routes

Vietnamese is the default without a prefix; English uses `/en`. Folder names use English segments; Vietnamese segments are declared in next-intl `pathnames`. A page declares `hreflang` only for languages with a published translation.

| Page | VI | EN |
| --- | --- | --- |
| Home | `/` | `/en` |
| Tour listing / detail | `/tours`, `/tours/[slug]` | `/en/tours`, `/en/tours/[slug]` |
| Destinations | `/diem-den`, `/diem-den/[slug]` | `/en/destinations`, `/en/destinations/[slug]` |
| Travel styles | `/phong-cach/[slug]` | `/en/travel-styles/[slug]` |
| Tailor-made inquiry | `/thiet-ke-rieng` | `/en/tailor-made` |
| Journal | `/journal`, `/journal/[slug]`, `/journal/chu-de/[slug]` | `/en/journal`, `/en/journal/[slug]`, `/en/journal/topics/[slug]` |
| About, reviews, contact, FAQ | `/ve-chung-toi`, `/danh-gia`, `/lien-he`, `/cau-hoi-thuong-gap` | `/en/about`, `/en/reviews`, `/en/contact`, `/en/faq` |
| Policies | `/chinh-sach/[slug]` | `/en/policies/[slug]` |
| Search | `/tim-kiem` | `/en/search` |
| Book a tour | `/dat-tour/[tourSlug]` | `/en/book/[tourSlug]` |
| Checkout | `/thanh-toan/[code]`, `…/phuong-thuc`, `…/ket-qua` | `/en/checkout/[code]`, `…/payment`, `…/result` |
| Sales payment link | `/thanh-toan/link/[token]` | `/en/pay/[token]` |
| Booking lookup | `/tra-cuu-booking` | `/en/booking-lookup` |
| Newsletter confirmation (noindex) | `/ban-tin/xac-nhan` | `/en/newsletter/confirm` |
| Customer auth | `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau` | `/en/login`, `/en/register`, `/en/forgot-password`, `/en/reset-password` |
| Account | `/tai-khoan`, `/tai-khoan/booking`, `/tai-khoan/ho-so` | `/en/account`, `/en/account/bookings`, `/en/account/profile` |

Admin routes (no prefix, not indexed): `/admin`, `/admin/bookings` (with `/admin/bookings/attention`, the "needs attention" queue), `/admin/departures`, `/admin/tours`, `/admin/destinations`, `/admin/travel-styles`, `/admin/cancellation-policies`, `/admin/inquiries`, `/admin/customers`, `/admin/payments`, `/admin/journal`, `/admin/pages`, `/admin/reviews`, `/admin/media`, `/admin/redirects`, `/admin/subscribers`, `/admin/settings`, `/admin/staff`, `/admin/audit-log`, `/admin/mfa`, `/admin/design-system` (dev only).

Technical routes: `/sitemap.xml`, `/robots.txt`, `opengraph-image` file routes (ADR-028), `/api/payments/vnpay/ipn`, `/api/webhooks/bank-transfer`, `/api/cron/*` (secret-protected), `/api/health`, `/api/monitoring/test-error` (POST, MFA-verified admin only; throws to test Sentry), `/auth/confirm`, `/auth/callback`.

## Security

**Payments**: confirm only from IPN/webhooks with verified signatures (HMAC for VNPay, API key for SePay/Casso); check amount, reference and status; idempotent via `webhook_events`; prices always recalculated on the server; restrict webhook source IPs where published.

**Auth and access**: TOTP MFA for admin and accountant; staff accounts only by admin invitation; a trigger blocks `role` changes by non-admins; customers read only their own bookings (`customer_id = auth.uid()`); guests use single-use emailed lookup links. `proxy.ts` is never the only auth check.

**Supabase**: secret key only in server env vars (never `NEXT_PUBLIC_`); RLS on every table; `supabase db lint` in CI; Security Advisor clean before launch; `security definer` functions set `search_path = ''` and revoke execute from `public`, `anon`, `authenticated` unless intentionally public (e.g. `search_tours`).

**Application**: Zod on every input; no string-built SQL; Tiptap rendered from JSON through a node whitelist; CSP per page type (ADR-027): a nonce-free policy on cached public pages and `/auth/*`, and on checkout, account and admin fully dynamic rendering (root layout with `instant = false` and `connection()`) with a per-request nonce from the proxy and `'strict-dynamic'`; HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; Upstash rate limits on sign-in, sign-up, inquiries, booking lookup, booking creation and payment start; Turnstile on public forms (its script loads on the first interaction with the form; CSP allows `https://challenges.cloudflare.com` in `script-src` and `frame-src` on public pages, ADR-029); redirects read from Redis, never from the database in `proxy.ts`; uploads checked for real type, size and pixel count, then re-encoded (metadata stripped) before they are public; no SVG uploads.

**Personal data and compliance** (verify with legal counsel): Vietnamese personal data rules (Decree 13/2023/ND-CP and the Personal Data Protection Law) — privacy policy, consent before collection, proof in `consent_records`, export and deletion on request; e-commerce website notification to the Ministry of Industry and Trade; company details and tour operator licence in the footer; no passport numbers on the website; audit log for bookings, payments and customer data; daily backups + PITR from launch; SPF, DKIM, DMARC on the sending domain.

## SEO

- Server-rendered public pages, per-language slugs, canonical URLs, `hreflang` for published translations only, `sitemap.xml` split by type with `lastmod`, `robots.txt` blocking `/admin`, account and checkout.
- JSON-LD: `TravelAgency` + `Organization`, `Product` + `Offer` for tours, `TouristTrip`/`ItemList`, `Article`, `BreadcrumbList`, `FAQPage`. `AggregateRating` only from verified reviews (P1).
- Automatic 301 on slug change; Metadata API on every public page; Open Graph images from photos or generated per locale (ADR-028).
- Search Console for both languages; GA4 events `view_item_list`, `view_item`, `begin_checkout`, `purchase`, `generate_lead`.

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

Sentry for errors and IPN failures; alerts on failed `pg_cron` runs (`cron.job_run_details`); uptime check on `/api/health`; structured logs with the booking code and never card data, passwords or tokens; runbooks for gateway outages, unconfirmed payments, the "needs attention" queue and refunds.

## Environments

| Env | URL | Supabase project |
| --- | --- | --- |
| Local | http://localhost:3000 | `supabase start` (Docker) |
| Preview / staging | Vercel preview URLs | Staging project (Singapore) |
| Production | > TODO (domain) | Production project (Singapore) |
