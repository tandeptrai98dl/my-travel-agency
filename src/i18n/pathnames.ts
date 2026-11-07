/**
 * Localized public routes (ARCHITECTURE.md "Routes"). Keys are the internal paths, which match
 * the English folder names under src/app/(public)/[locale] (and (secure)/[locale] from Phase 4); values are the public URL per locale.
 * Vietnamese is served without a prefix, English under /en.
 */
export const pathnames = {
  "/": "/",
  "/tours": "/tours",
  "/tours/[slug]": "/tours/[slug]",
  "/destinations": { vi: "/diem-den", en: "/destinations" },
  "/destinations/[slug]": { vi: "/diem-den/[slug]", en: "/destinations/[slug]" },
  "/travel-styles/[slug]": { vi: "/phong-cach/[slug]", en: "/travel-styles/[slug]" },
  "/tailor-made": { vi: "/thiet-ke-rieng", en: "/tailor-made" },
  "/journal": "/journal",
  "/journal/[slug]": "/journal/[slug]",
  "/journal/topics/[slug]": { vi: "/journal/chu-de/[slug]", en: "/journal/topics/[slug]" },
  "/about": { vi: "/ve-chung-toi", en: "/about" },
  "/reviews": { vi: "/danh-gia", en: "/reviews" },
  "/contact": { vi: "/lien-he", en: "/contact" },
  "/faq": { vi: "/cau-hoi-thuong-gap", en: "/faq" },
  "/policies/[slug]": { vi: "/chinh-sach/[slug]", en: "/policies/[slug]" },
  "/search": { vi: "/tim-kiem", en: "/search" },
  "/book/[tourSlug]": { vi: "/dat-tour/[tourSlug]", en: "/book/[tourSlug]" },
  "/checkout/[code]": { vi: "/thanh-toan/[code]", en: "/checkout/[code]" },
  "/checkout/[code]/payment": {
    vi: "/thanh-toan/[code]/phuong-thuc",
    en: "/checkout/[code]/payment",
  },
  "/checkout/[code]/result": { vi: "/thanh-toan/[code]/ket-qua", en: "/checkout/[code]/result" },
  "/pay/[token]": { vi: "/thanh-toan/link/[token]", en: "/pay/[token]" },
  "/booking-lookup": { vi: "/tra-cuu-booking", en: "/booking-lookup" },
  "/newsletter/confirm": { vi: "/ban-tin/xac-nhan", en: "/newsletter/confirm" },
  "/newsletter/unsubscribe": { vi: "/ban-tin/huy", en: "/newsletter/unsubscribe" },
  "/login": { vi: "/dang-nhap", en: "/login" },
  "/register": { vi: "/dang-ky", en: "/register" },
  "/forgot-password": { vi: "/quen-mat-khau", en: "/forgot-password" },
  "/reset-password": { vi: "/dat-lai-mat-khau", en: "/reset-password" },
  "/account": { vi: "/tai-khoan", en: "/account" },
  "/account/bookings": { vi: "/tai-khoan/booking", en: "/account/bookings" },
  "/account/bookings/[code]": { vi: "/tai-khoan/booking/[code]", en: "/account/bookings/[code]" },
  "/account/profile": { vi: "/tai-khoan/ho-so", en: "/account/profile" },
} as const;
