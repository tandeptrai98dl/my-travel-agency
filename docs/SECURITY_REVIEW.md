# Security review

Phase 6 spec decision 1: every line is **pass** (with evidence), **fail** (with an issue) or **accepted** (with a reason). Stream A's PR 6A adds the rest of the review (RLS matrix, definer functions, service-role use, Security Advisor, the secure and admin headers, permissions, dependencies and secrets) above or below this section.

## Public pages (Stream B)

Scope: the public website (`src/app/(public)`), the staff sign-in pages (`/auth/*`), the public forms and the analytics of ADR-039. Reviewed on 2026-11-07 against `ARCHITECTURE.md` "Security", ADR-027, ADR-029 and ADR-039.

### Headers

| Check | Result | Evidence |
| --- | --- | --- |
| Every public page type and `/auth/*` send exactly one CSP, nonce-free, with no `'unsafe-eval'` or `'strict-dynamic'` | pass | `tests/e2e/public-headers.spec.ts` (home, listing, detail, search, destinations, travel styles, journal, article, topic, static pages, policies, reviews, contact, wizard, newsletter pages, a 404 and a 308; four `/auth/*` pages) |
| `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, frames only from Turnstile | pass | same spec; `src/lib/csp.test.ts` |
| HSTS at least one year, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` with camera, microphone, geolocation, payment, USB and Topics off | pass | same spec; `src/lib/security-headers.ts` |
| HSTS `includeSubDomains; preload` | accepted until launch | needs the production domain with every subdomain on HTTPS (decision 1; owner). Added in PR 6L, then submitted to the preload list |
| `script-src 'unsafe-inline'` on public pages | accepted | ADR-027: public pages are prerendered, so Next.js's inline bootstrap scripts cannot carry a nonce, and hashes cannot cover streamed scripts (spike in PR H). Mitigations: no inline event handlers or user HTML (rich text goes through the Tiptap whitelist), `object-src 'none'`, `base-uri 'self'`, scripts only from `'self'`, Turnstile and (with a measurement ID) gtag.js's host |
| `style-src 'unsafe-inline'` | accepted | Next.js and Radix inline styles; styles cannot run script |

### CSP with analytics (ADR-039)

| Check | Result | Evidence |
| --- | --- | --- |
| Without `NEXT_PUBLIC_GA_MEASUREMENT_ID` no Google host is allowed anywhere | pass | `src/lib/csp.test.ts` "are absent without a measurement ID" |
| With it, public pages add only `https://*.googletagmanager.com` to `script-src` and the three Google hosts to `connect-src` and `img-src`; no frames, no eval (no tag manager) | pass | `src/lib/csp.test.ts`; `tests/e2e/public-headers.spec.ts` checks `script-src` is exactly `'self' 'unsafe-inline'`, Turnstile and that host |
| Wildcard Google hosts (`*.google-analytics.com`, `*.analytics.google.com`, `*.googletagmanager.com`) | accepted | Google's documented CSP for GA4: collection goes to regional hosts (`region1.google-analytics.com`, …) that cannot be listed in advance. They are Google-owned zones; nothing else is allowed through them |
| Secure root: Google's hosts only where GA may load (book, checkout, its payment and result pages), never on the payment link, booking lookup, customer sign-in or the account (#55 review m4) | pass (fixed in this PR) | `isAnalyticsSecurePath()` in `src/lib/csp.ts`, used by `src/proxy.ts`; `src/lib/csp.test.ts` checks it agrees with the loader's `NO_ANALYTICS_ROUTES` for every secure route in both languages, and that `/thanh-toan/link/…` (same prefix as checkout) has none; `tests/e2e/analytics-csp.spec.ts` checks the served policies |
| A document opened on a route without GA never loads gtag.js, also after a client-side navigation into checkout (its policy would block Google anyway) | pass (new in this PR) | `src/components/analytics/gtag.ts` reads the document's landing URL (Navigation Timing); `src/components/analytics/gtag.sync.test.ts` |
| Trade-off of that rule: a payment made after the payment link's button or the account's "pay the balance" link, in the same document, sends no `purchase` | accepted | measurement only, in favour of never allowing Google on token or account pages. A checkout opened by a full page load (the emailed link, the booking flow, a reload) is measured |
| gtag.js loads with the request nonce on secure pages; `'strict-dynamic'` is kept | pass | `loadScript()` in `gtag.ts`; E2E `tests/e2e/analytics.spec.ts` (no CSP violation fixture failures on checkout and result) |
| Nothing GA receives carries a code, token, address or the consent id | pass | decision 7 tests from PR 6P (`analytics.test.ts`, `analytics.spec.ts`), unchanged |
| Turnstile (`https://challenges.cloudflare.com`) in `script-src`, `connect-src` and `frame-src` | accepted | ADR-029; its script loads only on the first interaction with a form |

### Rate limits and fail modes of the public forms

Every limit is a fixed window in Upstash (`src/lib/rate-limit.ts`, hashed keys). Proof: `src/lib/rate-limit.public-forms.test.ts` runs each form through its real Server Action, service and `rateLimit()` against an in-memory Upstash that can also fail or be missing.

| Form | Limits | Over the limit | Fail mode (ADR-029) | Result |
| --- | --- | --- | --- | --- |
| Contact (`sendContactMessage`) | 5 per IP / 10 min (before Turnstile), 3 per address / hour (after Turnstile) | refused, nothing written, no email | closed: refused, nothing written, Turnstile not asked; without Upstash the form is shown disabled | pass |
| Newsletter (`subscribeToNewsletter`) | 5 per IP / 10 min, 3 per address / day (both before Turnstile) | refused, no token stored, no email | closed, as above | pass |
| Tailor-made wizard (`sendInquiry`, `tailor_made`) | 5 per IP / 10 min, 3 per address / day | refused, nothing written | closed, as above | pass |
| Private-tour inquiry (`sendInquiry`, `tour_inquiry`) | as the wizard | refused, nothing written | closed, as above | pass |
| Cookie-consent record (`recordConsentChoice`) | 20 per IP / 10 min | refused, no row | closed: no row, logged at error level without the id; the choice already applies in the browser (cookie first) and the record is retried once on the next page view | pass; E2E `tests/e2e/public-rate-limits.spec.ts` (CI has no Upstash: the choice applies, gtag.js loads, no `cookie_consents` row) |

Requests without a usable IP share one `unknown` bucket per form (never the case behind Vercel). Booking creation and payment start fail open by design (ADR-033) and are reviewed by Stream A with the secure pages.

### Follow-ups

- None blocking. The HSTS preload line closes in PR 6L.
