# Features

Derived from `PROJECT_BRIEF.md` and the full-scope decision (ADR-005).

Priority: **P0** = required for launch, **P1** = 1–3 months after launch, **P2** = later.
Business rule defaults are in ADR-016 (accepted; configurable in Settings where possible).

## Customer Website

### Homepage (P0)

- [ ] Cinematic hero (full-bleed photo or video, headline, search by destination, month, style)
- [ ] Featured tours, featured destinations, travel styles
- [ ] Why choose us / trust signals (licence, years, partners)
- [ ] Testimonials and journal teaser
- [ ] Tailor-made CTA and newsletter sign-up
- [ ] Sections fixed in code; content picked via "featured" flags and the `homepage` setting

### Tour listings (P0) — spec: `docs/specs/tour-listing.md`

- [ ] Tours from the database, 12 per page, numbered pagination
- [ ] Search by name (diacritic-insensitive: "ha long" finds "Hạ Long") or tour code
- [ ] Filters: domestic or international, destination (incl. child destinations), price range, departure month, duration
- [ ] Sorting: recommended, price, duration, upcoming departure
- [ ] Filters live in the URL; loading, empty and error states

### Tour details (P0)

- [ ] Gallery, highlights, day-by-day itinerary, inclusions and exclusions, practical info, FAQ
- [ ] Clearly stated pricing per adult/child/infant, single supplement, deposit terms, cancellation policy
- [ ] Upcoming departures with live price and seats left
- [ ] Booking CTA (group tours) or inquiry CTA (private tours)
- [ ] Reviews, related tours, SEO metadata, JSON-LD and Open Graph image

### Destinations and travel styles (P0)

- [ ] Destinations list (domestic and international), destination tree (country → region → city)
- [ ] Destination page: description, best time to visit, its tours
- [ ] Travel style pages (honeymoon, family, wellness, adventure…)

### Booking and payment (P0)

- [ ] Book a group tour: date → travellers and single rooms → contact details → travellers (can be completed later) → deposit or full, optional VAT invoice details, accept terms → pay
- [ ] Price recalculated on the server at every step; at most 4 steps
- [ ] Seats held only when the customer clicks Pay, with a real countdown (30 min VNPay, 2 h transfer)
- [ ] VNPay; VietQR bank transfer with automatic reconciliation
- [ ] Payment confirmed only by verified IPN/webhook; return page shows "waiting for confirmation"
- [ ] Pay the balance from the reminder email or the booking page; reminders 7 and 2 days before the due date
- [ ] Guest booking lookup with booking code + email (single-use emailed link, 30 min)
- [ ] Confirmation emails to customer and staff

### Private and tailor-made trips (P0)

- [ ] 5-step tailor-made wizard, draft saved in the browser, Turnstile
- [ ] Inquiry from a private-tour page prefilled with the tour
- [ ] Corporate clients can add a company name
- [ ] Customer receives a confirmation email with the inquiry code; sales notified within a minute
- [ ] Sales sends a quote with a payment link; payment follows the standard flow

### Customer account (P0)

- [ ] Sign up / sign in with email (Google when enabled), email verification, password reset
- [ ] Earlier bookings with the same email attach to the account after verification
- [ ] My bookings, booking detail, payment history, edit traveller details
- [ ] Profile, change password, request account and data deletion

### About, reviews, contact, FAQ, policies (P0)

- [ ] About us: brand story, team, values, licences
- [ ] Reviews page
- [ ] Contact page: office details, map, Zalo/WhatsApp; contact form saved as an inquiry with `source = 'contact'`
- [ ] FAQ and policy pages (terms, privacy, cancellation, payment)
- [ ] Floating Zalo, WhatsApp and hotline buttons on every page

### Travel journal (P0)

- [ ] Article list with categories, article page (editorial layout), SEO per article

### Language (P0)

- [ ] Vietnamese (default) and English for every public page and email; switching keeps the current page
- [ ] Pages without a published translation return 404

### Later

- [ ] P1: MoMo, international cards (OnePay or PayPal), indicative USD prices, coupons, add-ons, date changes, wishlist, post-trip reviews, PDF vouchers and quotes, e-invoice integration, tour comparison, itinerary map, live chat
- [ ] P2: more languages, loyalty programme, AI travel assistant, mobile app

## Admin System (Vietnamese only)

### Authentication and permissions (P0)

- [x] Email and password login (from the starter)
- [ ] Protected `/admin` with role checks on the server and RLS (ADR-009)
- [ ] Roles: sales, sales manager, operator, accountant, editor, admin; MFA required for admin and accountant
- [ ] Staff invited by admin only

### Dashboard (P0)

- [ ] New bookings, revenue collected, unanswered inquiries, payments about to expire, departures in the next 14 days, bookings needing attention, departures below minimum travellers

### Inquiries (P0)

- [ ] Inbox filtered by status and owner, assignment, internal notes, time to first response
- [ ] Create a quote (a `quoted` booking) and send a payment link

### Bookings (P0)

- [ ] List filtered by status, departure, tour and owner; detail with an event timeline
- [ ] Confirm only after an availability check (brief §6); mark paid only with payment-system proof
- [ ] Edit travellers, rooms and travellers count with recalculated price; adjustment lines with a reason
- [ ] Manual bookings for phone customers; resend emails; cancel with suggested refund
- [ ] "Needs attention" queue: late payments, under/overpaid transfers, overdue balances, cancelled departures

### Tours, departures, destinations (P0)

- [ ] Tours with VI/EN tabs and per-language publishing, drag-and-drop itinerary, photos, prices, deposit terms, cancellation policy, SEO; draft, preview, publish, duplicate
- [ ] Departures managed separately (brief §6): calendar and table, bulk creation, prices, seats, status, minimum travellers, passenger list CSV export (audit-logged), departure cancellation
- [ ] Destinations (tree, with `key`) and travel styles

### Payments (P0)

- [ ] Ledger by gateway and status; manual recording (cash, wrong-memo transfers) with a mandatory note; refunds; unmatched transfers to assign

### Content and media (P0)

- [ ] Journal, static pages, reviews (approve, hide, feature)
- [ ] Media library on Supabase Storage: upload, mandatory VI/EN alt text, search, small-image warning
- [ ] Redirects (automatic 301 on slug change), newsletter subscribers

### Customers (P0)

- [ ] Profiles with booking and inquiry history, notes; personal data export and deletion on request

### Settings, staff, audit (P0)

- [ ] Company details, licence, contacts, receiving bank account, booking rules, cancellation policies, homepage content
- [ ] Staff management with roles; audit log with before/after values

### Later

- [ ] P1: revenue reports, coupons, versioned PDF quotes, reply templates, Zalo OA notifications
- [ ] P2: supplier and trip cost management, multiple branches, fine-grained permissions

## Cross-cutting (P0)

- [ ] Responsive on desktop, tablet and mobile
- [ ] Accessibility (WCAG AA)
- [ ] SEO: metadata, sitemap.xml, robots.txt, hreflang, structured data
- [ ] Security per `ARCHITECTURE.md` (RLS, rate limits, Turnstile, CSP, audit log)
- [ ] Consent banner (GA4 Consent Mode v2) and recorded consent for terms, privacy and marketing
- [ ] Production deployment on Vercel
