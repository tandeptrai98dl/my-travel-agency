# Design System

Direction: **Premium Luxury Travel** — "quiet luxury" in the style of a travel magazine. Elegant, modern, editorial, minimalist, with cinematic photography (`PROJECT_BRIEF.md` §5). Luxury comes from restraint, not effects.

Built on **shadcn/ui** (new-york style) and **Tailwind CSS 3**, with tokens as CSS variables in `src/app/globals.css`, mapped in `tailwind.config.ts`.

## Principles

1. **Photography leads**: full-bleed, cinematic images. The UI frames them rather than competing with them.
2. **Restraint**: generous whitespace, one primary action per screen, no flashing banners, fake countdowns or discount pop-ups. Gold is an accent, never a fill for large areas.
3. **Editorial typography**: a serif display face for headings and a clean sans for body text and UI; small uppercase, letter-spaced eyebrows.
4. **Trust and clarity**: prices, deposit terms, dates, availability and cancellation policy are always easy to find before payment.
5. **Accessible**: WCAG AA contrast, keyboard navigation, visible focus rings, alt text in both languages on every image, `prefers-reduced-motion` respected.
6. **Responsive**: equally refined on desktop, tablet and mobile.
7. **Bilingual**: every layout works with Vietnamese diacritics and longer English or Vietnamese strings.

## Color palette

> Status: **approved** (ADR-021). Applied in `src/app/globals.css`; contrast pairs are unit-tested.

| Name | Hex | Role |
| --- | --- | --- |
| Deep Navy | `#0F1B2D` | primary brand color, headings, dark sections, primary buttons |
| Warm Ivory | `#F7F3EC` | main page background |
| Champagne Gold | `#C9A96E` | accents: dividers, icons, highlights, focus |
| White | `#FFFFFF` | cards, form fields, elevated surfaces |
| Warm Gray | `#8A847B` | borders, dividers, decorative muted UI |
| Muted text | `#726D65` | secondary text (Warm Gray darkened for AA: 4.6:1 on ivory) |
| Success | `#2F6B4F` | paid, seats available |
| Warning | `#865A11` | almost full, awaiting payment (darkened for AA text on ivory) |
| Error | `#A23B3B` | errors, cancelled |

### Token mapping (light theme)

| Token | Color |
| --- | --- |
| `background` | Warm Ivory |
| `foreground` | Deep Navy |
| `card`, `popover` | White |
| `primary` / `primary-foreground` | Deep Navy / Warm Ivory |
| `secondary`, `muted` | lighter ivory tint `#FBF8F3` |
| `accent` | Champagne Gold (with Deep Navy text) |
| `muted-foreground` | Muted text `#726D65` |
| `border` | light warm-gray tint `#E2DBCF` (decorative dividers) |
| `input` | Warm Gray `#8A847B` (form borders need 3:1) |
| `ring` | deep gold `#A7823E` (3:1 focus indicator on ivory and white) |
| `success`, `warning`, `destructive` | Success, Warning, Error |

Navy sections (`.theme-navy`) re-map the tokens: background Deep Navy, text Warm Ivory, cards `#16253B`, muted text `#B9B4AA`, borders `#2A3A52`, ring Champagne Gold, and lighter status colours with navy text (destructive `#E89696`, success `#7DC1A0`, warning `#E3B567`), because the light-theme status colours fail AA on navy.

### Theme

ADR-017: the public website uses a fixed light theme, with Deep Navy sections (ivory text, gold accents) for contrast. Remove the theme switcher from the public layout. next-themes stays for a possible admin dark mode later.

**Contrast**: gold on ivory or white fails AA for body text. Use gold only for decoration, large text (≥ 24px) or on navy.

## Typography

> Status: **approved** (ADR-021). Loaded through `next/font` with the `latin` and `vietnamese` subsets.

| Use | Font | Notes |
| --- | --- | --- |
| Display / headings | Cormorant Garamond, weight 500–600 | serif, editorial feel |
| Body / UI | Be Vietnam Pro, weight 400–600 | designed for Vietnamese |

- Check stacked diacritics (ặ, ẫ, ỡ) at every size; heading line-height at least 1.15 so diacritics are never clipped (Display and H1 desktop line-heights were raised from 80 and 64 to meet this).

| Style | Desktop (size/line, px) | Mobile | Font |
| --- | --- | --- | --- |
| Display | 72/84 | 44/52 | Serif 500 |
| H1 | 56/66 | 38/46 | Serif 500 |
| H2 | 40/48 | 30/38 | Serif 500 |
| H3 | 28/36 | 24/32 | Serif 600 |
| H4 | 20/28 | 18/26 | Sans 600 |
| Body L | 18/30 | 17/28 | Sans 400 |
| Body | 16/26 | 16/26 | Sans 400 |
| Small | 14/22 | 14/22 | Sans 400 |
| Eyebrow | 12/16, uppercase, `tracking-[0.2em]` | 12/16 | Sans 600 |

## Layout and spacing

- Container: `mx-auto max-w-7xl px-4 md:px-8`; long text blocks max 680px.
- Spacing scale in multiples of 4px; section spacing `py-16 md:py-28` (up to 160px on large editorial sections).
- Grids: `grid gap-8 sm:grid-cols-2 lg:grid-cols-3`; 12-column grid for editorial layouts.
- Radius: `--radius: 0.25rem` (`rounded-md` = 2px for inputs and buttons, `rounded-lg` = 4px for cards, none on images). Sharp corners read as more premium.
- Shadows almost never; depth comes from ivory/white surfaces and 1px borders.
- Imagery: 16:9 or 21:9 heroes, 4:5 tour cards, 3:2 content images; `next/image` with proper `sizes`; originals at least 2400px on the long edge.

## Motion

Subtle and slow: 200ms hover, 400ms reveal, 600–800ms hero images; easing `cubic-bezier(0.22, 1, 0.36, 1)`. Fade and 12–16px upward reveal on scroll, 1.03 image zoom on hover, link underline drawing left to right. Disabled under `prefers-reduced-motion`.

## Voice

Calm, specific and visual. Describe experiences instead of adjectives ("a private dinner on the sand at sunset", not "an amazing dinner"). No stacked exclamation marks, "shock prices" or "mega deals". Both languages follow the same tone.

## Icons

`lucide-react`, thin stroke (`strokeWidth={1.5}`), `h-4 w-4` inline and `h-5 w-5` in buttons; only where they speed up understanding (duration, destination, meals).

## Components

### Available

- `src/components/ui`: badge (default, secondary, outline, gold, success, warning, destructive), button (default, gold, secondary, outline, ghost, link, destructive; sizes sm 36 px, default 44 px, lg 48 px, icon), card, checkbox, dropdown-menu, input, label
- `src/components/typography`: Heading, Eyebrow (gold inside navy sections), SectionHeading, Prose, Price
- `src/components/layout`: Container, Section (ivory, white, navy tones), SiteHeader, MegaMenu, MobileNav, SiteFooter, LanguageSwitcher, ContactFloatingButton, CookieConsentBanner
- `src/components/ui` (shell): dialog, sheet, accordion, switch
- `src/components/ui` (Phase 1 PR 7): textarea, select, radio-group, tooltip, popover, tabs, separator, avatar, skeleton, spinner, alert, toast + `Toaster`/`toast()`, pagination (real links; `paginationRange()`), icon-button (required `label`), form (React Hook Form + Zod; `FormMessage formatMessage` maps Zod keys to text), tag, status-badge (one colour map for booking, payment, departure, inquiry and transaction statuses), empty-state
- `src/components/admin` (Phase 2 PR A): AdminShell (role-based sidebar from the permission matrix, top bar, sheet below lg), PageHeader, DataTable (URL-driven sort and paging), FilterBar (GET form), LocaleTabs, SlugInput, SeoFields, MoneyInput, ConfirmDialog, ListEditor
- `src/components/admin/media` (Phase 2 PR B): MediaUploader (signed direct upload, live status per file, drag and drop), MediaEditDialog (VI/EN alt text, credit, delete when unused), MediaPicker (search, inline upload, single or multiple)
- `src/components/admin/taxonomy` (Phase 2 PR C): DestinationForm, TravelStyleForm, CancellationPolicyForm (React Hook Form + Zod, server errors put back on their fields), TranslationFields (one language: name, slug with an on-blur availability check, text, SEO, its own publish switch), HeroField (MediaPicker), LocaleBadges, DeleteEntityButton; `AdminMessages` passes one page's admin strings to its client components; StatusBadge also maps `publish_status`
- `src/components/admin/tours` (Phase 2 PR D): TourEditor (sections for general facts, admin-only prices, catalog links, media, VI/EN content, publishing), TourTranslationFields (itinerary day cards, lists, FAQs, SEO, sharing image), GalleryField and RowControls (button reordering with announcements), NewTourForm, DuplicateTourButton
- `src/components/admin/departures` (Phase 2 PR E): DepartureCalendar (Monday-first month grid, a day list below `md`), DepartureBulkCreator (weekday pattern or date list, server preview, skipped duplicates), DepartureEditor, shared CountField, PriceFields and PriceSummary
- `src/components/typography/rich-text.tsx` (Phase 2 PR F): RichText, the server-only whitelist renderer of Tiptap JSON into Prose (`renderImage` for public image components); `src/lib/rich-text.ts` holds the shared sanitizer
- `src/components/admin` (Phase 2 PR F): RichTextEditor (Tiptap with the fixed extension set, labelled toolbar, link dialog, library images); `admin/content`: PostEditor, PageEditor, CategoryForm, ContentTranslationFields, DeleteContentButton, ReviewActions, RedirectForm, DeleteRedirectButton, ResyncRedirectsButton, ExportSubscribersButton; StatusBadge also maps `review_status`
- `src/components/media`, `src/components/seo`, `src/components/tour` (Phase 3 PR H): ResponsiveImage (Supabase transform loader, blur placeholder, ImageFrame stand-in), JsonLd (escaped), Breadcrumbs (with BreadcrumbList), LocaleAlternates (per-language paths for the LanguageSwitcher), TourCard, TourDetailView with TourGallery (+ lightbox on demand), TourHeader, TourFactsBar, TourHighlights, ItineraryTimeline, InclusionsList, DepartureTable (live; cards below `md`), PriceTiers, PolicySummary, ReviewSummary, FaqList (`<details>`), BookingBox, RelatedTours
- `/admin/design-system`: staff-only review page of every token and component (404 in production builds unless `SHOW_DESIGN_SYSTEM=true`)

### Planned

| Group | Components |
| --- | --- |
| Primitives (shadcn) | Combobox, DatePicker, DateRangePicker, quantity Stepper, PhoneInput (with the forms that need them, Phases 2 and 4) |
| Typography | DateText |
| Layout | Breadcrumbs |
| Media | ResponsiveImage (blur placeholder), HeroMedia (image/video), Gallery + Lightbox, ImageCarousel |
| Marketing | Hero + HeroSearch, FeaturedTours, DestinationGrid, DestinationCard, TravelStyleCards, EditorialSplit, Testimonials, TrustBar, PressLogos, NewsletterSignup, CTABanner (tailor-made), JournalTeaser |
| Tour | TourCard, TourGrid, tour listing set (see `docs/specs/tour-listing.md`), TourHero, TourFactsBar, TourHighlights, ItineraryTimeline, InclusionsList, DepartureTable, PriceFromBox + sticky BookingWidget, FAQAccordion, RelatedTours, ReviewSummary |
| Booking | BookingStepper, PaxSelector, DepartureCalendar, PriceBreakdown, ContactForm, TravellerForm, PaymentPlanSelector, PaymentMethodSelector, VietQRPanel, HoldCountdown, PaymentResult, BookingSummaryCard, InvoiceInfoForm, CancellationPolicySummary, TermsConsent |
| Consultation | TailorMadeWizard (destination → timing → travellers → budget & style → contact), InquirySuccess |
| Account | AuthForm, GoogleButton, AccountNav, BookingListItem, BookingDetail, PaymentHistory, ProfileForm, DeleteAccountDialog |
| States | ErrorState, tour suggestions on the 404 page (Phase 3) |
| Admin | CommandMenu, StatCard, Timeline, NotesPanel, AuditTrail (per entity), AttentionQueue, ItineraryBuilder, StatusSelect, AssigneeSelect, QuoteForm, MfaEnrollment |
| Email (React Email) | Brand layout, BookingReceived, PaymentConfirmed, BookingConfirmed, BalanceReminder, BookingCancelled, InquiryReceived, NewInquiryAlert, PaymentLinkEmail, PasswordReset, VerifyEmail |

Add shadcn primitives with `npx shadcn@latest add <component>` where the registry is reachable; otherwise copy the new-york source onto the Radix package from npm (ADR-021). A dev-only `/admin/design-system` page shows every token and component for visual review.
