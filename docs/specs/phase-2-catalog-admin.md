# TASK-P2-01: Content and catalog admin

Phase 2 of `DEVELOPMENT_PLAN.md`. Staff manage every piece of public content and catalog data in the Vietnamese-only admin, so Phase 3 can build public pages on real data. No booking or payment logic (Phase 4).

## Inputs

- `ARCHITECTURE.md`: permission matrix, data flow (Server Actions → `requireRole()` → Zod → service), caching (ADR-015), security (uploads, Tiptap whitelist, redirects in Redis).
- `DATABASE.md`: schema, RLS summary, "Known Phase 0 limits" (price columns), storage buckets.
- `DESIGN_SYSTEM.md`: Admin component list; Phase 1 primitives and `/admin/design-system`.
- ADR-006 (per-language translations and publish flags), ADR-009 (roles, MFA), ADR-015 (cache tags), ADR-016 (only admin edits departure prices), ADR-022 (form pattern).

## Decisions taken in this spec (recommended defaults, owner pre-approved "recommended solutions")

1. **Price columns** (closes the Phase 0 limit; ADR-016: only admin sets prices). `before insert or update` triggers, so deleting and re-creating a row cannot get round them:
   - `tours`: only an MFA-verified admin sets `from_price`, `deposit_percent`, `balance_due_days` and `cancellation_policy_id`. An editor creates a tour with `from_price = 0` and the column defaults (the default cancellation policy); the admin sets prices, and publishing a group tour needs a departure, a private tour a `from_price` above 0 (decision 3).
   - `departures`: only admin sets `price_adult`, `price_child`, `price_infant` and `single_supplement`. Operators create departures (bulk creation is their daily job) whose prices are **copied by the trigger** from the tour's most recent departure, whatever the request says; a tour's first departure is created by an admin.
   - The service role and `postgres` stay trusted (seeding, Phase 4 functions). Recorded as ADR-023 with PR D.
2. **Audit log**: a generic `audit_row_change()` trigger (`security definer`, `search_path = ''`) writes `audit_logs` (`actor_id = auth.uid()`, action `<table>.<insert|update|delete>`, `changes = {before, after}` with only changed columns on update) for tours and their translations and links, departures, destinations, travel styles, cancellation policies, price tiers, posts, pages, reviews, media, redirects, settings and staff-relevant profile changes. No API role can write `audit_logs` directly (unchanged).
   - Profiles keep values only for `role`, `is_active` and `deleted_at`; personal-data columns are listed by name, never copied, so anonymising a profile leaves nothing behind (Decree 13/2023).
   - `departures.seats_reserved` changes alone are not logged (Phase 4 moves seats on every hold; `booking_events` records those).
   - No IP or user agent: admin writes arrive through Server Actions, so the database only sees the server; Server Actions that need them (Phase 4 manual payments) write their own `audit_logs` rows through the service role.
   - `audit_logs.actor_id` is `on delete set null`: deleting a user keeps the entries.
   - Changes made through the service role (staff invitations, Phase 4 functions) have no actor; the service writes an extra audit row naming the staff member who asked (decision 8).
3. **Publishing**: a parent row (`tours.status`, `destinations.status`, …) and each translation's `is_published` are separate switches (ADR-006). Publishing a translation requires its slug, title and SEO description; publishing a tour requires at least one published translation, a hero image with VI/EN alt text, and a price (a departure for group tours, `from_price > 0` for private tours). Checked in the service (Zod) and by a trigger, so the API cannot bypass it — including the reverse moves that would leave a published tour invalid (unpublishing its last translation, removing its hero image). The seed's published tours must pass the same checks.
4. **Slugs**: lower-case ASCII with hyphens, generated from the title with Vietnamese diacritics removed, editable, unique per locale (existing constraint). Changing the slug of a published translation creates a 301 `redirects` row from the old localized path (Phase 3 serves it from Redis).
5. **Redirects in Redis**: `redirects` stays the source of truth; saves sync to Upstash Redis when `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set and are a logged no-op otherwise (no account yet). An admin "resync all" action rebuilds Redis from the table (for redirects saved before Redis existed). The proxy reads Redis in Phase 3; from then on the Upstash variables are required in production (env validation).
6. **Media**: the browser uploads straight to Storage through a signed URL from a Server Action (Vercel limits request bodies to 4.5 MB); a second Server Action then checks the real type from the file's first bytes (JPEG, PNG, WebP, AVIF; never SVG) and the size (20 MB), reads width and height and makes a blur placeholder with `sharp` (ADR-023), and records the image; anything rejected is deleted. Paths are `yyyy/mm/<uuid>.<ext>` in the `media` bucket. VI and EN alt text are required before an image can be attached to published content. Images narrower than 2400 px get a warning, not a block.
7. **Rich text**: Tiptap (ADR-014) with a fixed extension set (paragraph, headings 2–3, bold, italic, link, bullet and ordered lists, blockquote, image from the media library). Stored as JSON; rendered on the server by a whitelist renderer shared with Phase 3; unknown nodes and marks are dropped; links get `rel="noopener noreferrer"` when external.
8. **Staff invitations**: admin (aal2) invites by email through the Supabase Auth Admin API from `src/modules/identity` (service role, server only), choosing the role; deactivation sets `is_active = false` (existing guard trigger). No self sign-up for staff. Because service-role writes have no actor in the audit trigger, the identity service also writes an `audit_logs` row with the inviting admin as actor.
9. **Cache**: every admin save calls `revalidateTag()` for the affected tags (`tours`, `tour:<id>`, `destinations`, `travel-styles`, `posts`, `pages`, `reviews`, `settings`) through one `content-cache.ts` helper.

## Steps

One pull request per group, one commit per step. Every Server Action: `requireRole()` → Zod → service; RLS stays the second layer.

### PR A — Admin shell and building blocks

1. **AdminShell**: role-based sidebar (items from `permissions.ts`; hidden items are also blocked on the server), topbar with user, role, MFA state and sign-out, `PageHeader`, breadcrumbs; responsive (sheet below `lg`).
2. **DataTable**: server-side pagination, sorting and filters in the URL (`?page=&sort=&q=`), built on `Pagination`; empty states and an admin error page; `FilterBar`. Status badges and row actions come with the first tables that have them (PRs C–E).
3. **Form building blocks**: `LocaleTabs` (VI/EN with per-language publish state and missing-field markers; editors switch to the first language with errors on submit), `SlugInput` (generate, edit; the uniqueness check is a Server Action per content type, added with each editor), `SEOFields` (title and description with length hints), `MoneyInput` (integer VND via `@/lib/money`), `ConfirmDialog`, `ListEditor` (ordered string lists).
4. **Audit**: migration with `audit_row_change()` and its triggers; pgTAP (actor, before/after, no direct writes, personal data, seat changes, user deletion); `/admin/audit-log` (admin only) with filters by entity and entity ID. A filter by actor comes with the staff list (PR G), and a per-record history (AuditTrail) with the editors.

### PR B — Media library

5. Upload Server Action (decision 6) with unit tests for type sniffing and size limits; `media` rows; Storage RLS unchanged (editor, admin).
6. `/admin/media`: grid with search by alt text and file name, edit alt text (VI/EN) and credit, small-image warning, delete only when unused (FK check, friendly error).
7. `MediaPicker` dialog (search, upload inline, select one or many) and `ResponsiveImage` for admin previews.

### PR C — Taxonomy and policies

8. `/admin/destinations`: tree view (country → region → city), create/edit with `key`, parent, coordinates, hero image, VI/EN translations (name, slug, summary, rich content, best time to visit, SEO), publish switches, sort order.
9. `/admin/travel-styles`: same pattern, flat list.
10. `/admin/settings/cancellation-policies` (admin): structured rules (`min_days_before`, `refund_percent`, validated as strictly decreasing days), VI/EN summary, one default; editing creates a new version (bookings keep snapshots, ADR-011).

### PR D — Tours

11. Price-column guard triggers (decision 1) with pgTAP for editor, operator, sales_manager, admin with and without aal2.
12. `/admin/tours`: list (status, scope, type, featured, per-language publish state, next departure), create, duplicate (copies content and media, not departures; new code, `draft`).
13. Tour editor: general (code, type, scope, duration, pax limits, child/infant ages), prices and terms (admin only; read-only for others), destinations and travel styles, gallery (MediaPicker, drag to reorder), VI/EN content (title, subtitle, summary, highlights, itinerary builder with day cards — title, description, meals, accommodation, images — inclusions, exclusions, practical info, FAQs), SEO and OG image, publish checks (decision 3), preview link (signed, draft mode).

### PR E — Departures

14. `/admin/departures`: table and month calendar filtered by tour, status and month; seats shown as reserved / capacity (read-only, ADR-012).
15. Create one or many: bulk creation by weekday pattern or list of dates within a range, duration from the tour, capacity, prices prefilled from the tour's latest departure; preview before saving; duplicates (`unique (tour_id, start_date)`) reported, not failed.
16. Edit status (`open`, `guaranteed`, `closed`; `cancelled` only by admin and only with no `pending_payment`/`confirmed` bookings until Phase 4 handles them), capacity (never below `seats_reserved`), note, minimum travellers; prices admin-only (decision 1).

### PR F — Journal, pages, reviews, redirects

17. `RichTextEditor` (decision 7) and the whitelist renderer (`src/components/typography/rich-text.tsx`) with unit tests (unknown nodes dropped, `javascript:` links removed).
18. `/admin/journal` (posts, categories), `/admin/pages` (fixed keys: about, terms, privacy, cancellation, payment, faq), both with VI/EN tabs and per-language publishing.
19. `/admin/reviews`: approve, reject, feature; verified flag is read-only.
20. `/admin/redirects` and slug-change redirects (decision 4), Redis sync (decision 5); `/admin/subscribers` read-only list with CSV export (audit-logged).

### PR G — Settings and staff

21. `/admin/settings` (admin, aal2): company and legal details, contacts, social links, bank account (not public), booking rules, homepage picks; each key validated with the `settings.schemas.ts` shapes; `revalidateTag("settings")`.
22. `/admin/staff` (admin, aal2): list, invite (decision 8), change role, deactivate; the profile guard trigger stays the database check.
23. Dashboard placeholder becomes a role-aware landing page with links to each section the role can use (metrics come in Phases 4–5).

## Acceptance criteria

- [ ] An editor creates and publishes a full VI/EN tour (content, itinerary, images with alt text, destinations, SEO) without a developer; the public cache tag is revalidated
- [ ] Per-language publishing: an unpublished EN translation keeps the tour out of `/en` (checked through the public client)
- [ ] Under-privileged roles are blocked on the server (Server Action returns forbidden) **and** by RLS (pgTAP), including: editor changing tour prices, operator changing departure prices, sales editing tours, editor opening settings or staff
- [ ] Departures: bulk creation of a season in one step; seats never editable; capacity never below reserved seats
- [ ] Every catalog and content change appears in the audit log with actor and before/after values
- [ ] Uploads reject SVG, fake extensions and files over 20 MB; published content cannot use images without VI/EN alt text
- [ ] Slug change on published content creates a 301 redirect
- [ ] Rich text renderer drops unknown nodes and unsafe links (unit tests)
- [ ] axe: no serious or critical violations on each admin list and editor page; keyboard operable
- [ ] Lint, typecheck, unit, pgTAP, E2E (editor publishes a tour; operator bulk-creates departures; role blocks) green; `PROGRESS.md` updated

## Out of scope

Public pages (Phase 3), bookings, payments and inquiries admin (Phases 4–5), dashboard metrics (Phases 4–5), revenue reports (P1), fine-grained permissions (P2).
