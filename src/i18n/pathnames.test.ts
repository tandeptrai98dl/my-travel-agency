import { describe, expect, it } from "vitest";

import { getPathname } from "./navigation";

describe("localized pathnames (ARCHITECTURE.md Routes)", () => {
  it.each([
    ["/", "/", "/en"],
    ["/tours", "/tours", "/en/tours"],
    ["/destinations", "/diem-den", "/en/destinations"],
    ["/tailor-made", "/thiet-ke-rieng", "/en/tailor-made"],
    ["/about", "/ve-chung-toi", "/en/about"],
    ["/contact", "/lien-he", "/en/contact"],
    ["/faq", "/cau-hoi-thuong-gap", "/en/faq"],
    ["/search", "/tim-kiem", "/en/search"],
    ["/booking-lookup", "/tra-cuu-booking", "/en/booking-lookup"],
    ["/login", "/dang-nhap", "/en/login"],
    ["/account/bookings", "/tai-khoan/booking", "/en/account/bookings"],
  ] as const)("%s -> %s (vi), %s (en)", (href, vi, en) => {
    expect(getPathname({ href, locale: "vi" })).toBe(vi);
    expect(getPathname({ href, locale: "en" })).toBe(en);
  });

  it("fills dynamic segments", () => {
    const href = { pathname: "/destinations/[slug]", params: { slug: "ha-long-bay" } } as const;
    expect(getPathname({ href, locale: "vi" })).toBe("/diem-den/ha-long-bay");
    expect(getPathname({ href, locale: "en" })).toBe("/en/destinations/ha-long-bay");

    const checkout = { pathname: "/checkout/[code]/payment", params: { code: "PTA-2611-0042" } } as const;
    expect(getPathname({ href: checkout, locale: "vi" })).toBe("/thanh-toan/PTA-2611-0042/phuong-thuc");
    expect(getPathname({ href: checkout, locale: "en" })).toBe("/en/checkout/PTA-2611-0042/payment");
  });
});
