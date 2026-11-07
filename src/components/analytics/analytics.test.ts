import { describe, expect, it } from "vitest";

import { pathnames } from "@/i18n/pathnames";
import { localizedPath } from "@/i18n/paths";
import { ALL_ACCEPTED, ESSENTIAL_ONLY } from "@/lib/consent";

import { beginCheckout, generateLead, purchase, viewItem, viewItemList } from "./events";
import { consentPlan, pageViewCommands } from "./gtag";
import { analyticsAllowed, NOT_FOUND_TEMPLATE, pageInfo, pageLocation, pageReferrer, pageTitle } from "./routes";
import { scrubParams, unsafeValue } from "./scrub";

const ORIGIN = "https://www.example.vn";
// Values a real path could carry: a booking code, a payment-link token, a slug.
const SAMPLE: Record<string, string> = {
  code: "PTA-2611-0042",
  token: "q5Yb0n3Jt6Rk_Pz8X2mWc4LhD9sVaE1u7GfNoQiByT0",
  slug: "ha-long-bay-cruise-hidden-sample",
  tourSlug: "ha-long-bay-cruise-hidden-sample",
};

const dynamicRoutes = Object.keys(pathnames).filter((route) => route.includes("["));

describe("GA page location (every dynamic route sent without its parameters)", () => {
  it("covers the dynamic routes", () => {
    expect(dynamicRoutes.length).toBeGreaterThanOrEqual(10);
  });

  for (const route of dynamicRoutes) {
    for (const locale of ["vi", "en"] as const) {
      it(`${route} (${locale})`, () => {
        const names = [...route.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
        const params = Object.fromEntries(names.map((name) => [name, SAMPLE[name] ?? `sample-${name}-value`]));
        const path = localizedPath(locale, { pathname: route, params });
        const location = pageLocation(ORIGIN, path);
        expect(location).toBe(ORIGIN + route);
        for (const value of Object.values(params)) expect(location).not.toContain(value);
        expect(pageReferrer(`${ORIGIN}${path}?access=${SAMPLE.token}#x`, ORIGIN)).toBe(ORIGIN + route);
        const [set] = pageViewCommands({ origin: ORIGIN, pathname: path, title: `Thanh toán ${SAMPLE.code} | Brand`, referrer: "" });
        expect(JSON.stringify(set)).not.toMatch(/PTA-2611-0042|q5Yb0n3Jt6Rk|hidden-sample/);
      });
    }
  }

  it("sends static routes as themselves and unknown paths as a fixed /404", () => {
    expect(pageLocation(ORIGIN, "/")).toBe(`${ORIGIN}/`);
    expect(pageLocation(ORIGIN, "/en")).toBe(`${ORIGIN}/`);
    expect(pageLocation(ORIGIN, "/lien-he")).toBe(`${ORIGIN}/contact`);
    expect(pageLocation(ORIGIN, "/en/contact")).toBe(`${ORIGIN}/contact`);
    for (const typed of ["/PTA-2611-0042", "/en/my-secret-path/x", "/thanh-toan/PTA-1/ket-qua/extra"]) {
      expect(pageInfo(typed).template).toBe(NOT_FOUND_TEMPLATE);
      expect(pageLocation(ORIGIN, typed)).toBe(`${ORIGIN}/404`);
    }
  });
});

describe("GA referrer and title", () => {
  it("reduces another site's referrer to its origin and drops anything unusable", () => {
    expect(pageReferrer("https://www.google.com/search?q=PTA-2611-0042", ORIGIN)).toBe("https://www.google.com");
    expect(pageReferrer("", ORIGIN)).toBe("");
    expect(pageReferrer("not a url", ORIGIN)).toBe("");
    expect(pageReferrer("android-app://com.google.android.gm/", ORIGIN)).toBe("");
    expect(pageReferrer(`${ORIGIN}/no/such/PTA-2611-0042`, ORIGIN)).toBe(`${ORIGIN}/404`);
  });

  it("never sends a code or token in the title", () => {
    expect(pageTitle("Đặt chỗ PTA-2611-0042 | Brand", "/thanh-toan/PTA-2611-0042")).toBe("/checkout/[code]");
    expect(pageTitle("Payment link | Brand", "/en/pay/abc")).toBe("/pay/[token]");
    // A title left over from the previous page after a client-side navigation.
    expect(pageTitle("Thanh toán · PTA-2611-0042", "/tours")).toBe("/tours");
    expect(pageTitle("Hạ Long | Brand", "/tours/ha-long")).toBe("Hạ Long | Brand");
    expect(pageTitle("Tours in ha-long-cruise | Brand", "/en/tours/ha-long-cruise")).toBe("Tours in [slug] | Brand");
  });
});

describe("routes without GA", () => {
  it("excludes the payment link, booking lookup, the account and the single-use pages in both languages", () => {
    for (const path of [
      "/thanh-toan/link/abc",
      "/en/pay/abc",
      "/tra-cuu-booking",
      "/en/booking-lookup",
      "/tai-khoan",
      "/tai-khoan/booking",
      "/tai-khoan/booking/PTA-2611-0042",
      "/en/account/profile",
      "/dang-nhap",
      "/en/reset-password",
      "/ban-tin/xac-nhan",
    ]) {
      expect(analyticsAllowed(path, ""), path).toBe(false);
    }
  });

  it("excludes the emailed-link redeem page (checkout with an access query) explicitly", () => {
    expect(analyticsAllowed("/thanh-toan/PTA-2611-0042", `?access=${SAMPLE.token}`)).toBe(false);
    expect(analyticsAllowed("/en/checkout/PTA-2611-0042", "?x=1&access=")).toBe(false);
    expect(analyticsAllowed("/thanh-toan/PTA-2611-0042", "")).toBe(true);
  });

  it("allows public pages, book, checkout and its result", () => {
    for (const path of ["/", "/en/tours", "/tours/ha-long", "/dat-tour/ha-long", "/thanh-toan/PTA-1/phuong-thuc", "/en/checkout/PTA-1/result", "/no-such-page"]) {
      expect(analyticsAllowed(path, ""), path).toBe(true);
    }
  });
});

describe("Consent Mode v2 state machine", () => {
  const at = new Date("2026-11-07T00:00:00Z");
  const analyticsOnly = { analytics: true, marketing: false };

  it("does nothing before analytics is granted", () => {
    expect(consentPlan("idle", ESSENTIAL_ONLY, "G-TEST1234", at)).toMatchObject({ next: "idle", commands: [], loadScript: false });
  });

  it("defaults to denied, then updates, then configures without a page view, then loads the script", () => {
    const plan = consentPlan("idle", analyticsOnly, "G-TEST1234", at);
    expect(plan.next).toBe("active");
    expect(plan.loadScript).toBe(true);
    expect(plan.commands).toEqual([
      ["consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }],
      ["set", "ads_data_redaction", true],
      ["consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }],
      ["js", at],
      ["config", "G-TEST1234", { send_page_view: false }],
    ]);
  });

  it("grants the ad signals only with marketing", () => {
    const [, , update] = consentPlan("idle", ALL_ACCEPTED, "G-TEST1234", at).commands;
    expect(update).toEqual(["consent", "update", { analytics_storage: "granted", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" }]);
    expect(consentPlan("active", analyticsOnly, "G-TEST1234").commands).toEqual([
      ["consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }],
    ]);
  });

  it("withdraws: back to denied, hits disabled, cookies removed; a new grant resumes", () => {
    const withdraw = consentPlan("active", ESSENTIAL_ONLY, "G-TEST1234");
    expect(withdraw).toEqual({
      next: "withdrawn",
      commands: [["consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]],
      loadScript: false,
      disable: true,
      clearCookies: true,
    });
    expect(consentPlan("withdrawn", ESSENTIAL_ONLY, "G-TEST1234")).toMatchObject({ next: "withdrawn", commands: [], clearCookies: true });
    expect(consentPlan("withdrawn", analyticsOnly, "G-TEST1234")).toMatchObject({ next: "active", loadScript: false, disable: false });
  });

  it("sends page_view with templates only", () => {
    expect(pageViewCommands({ origin: ORIGIN, pathname: "/en/checkout/PTA-2611-0042/result", title: "Result | Brand", referrer: `${ORIGIN}/checkout/[code]/payment` })).toEqual([
      ["set", { page_location: `${ORIGIN}/checkout/[code]/result`, page_referrer: `${ORIGIN}/checkout/[code]/payment`, page_title: "/checkout/[code]/result" }],
      ["event", "page_view", { site_language: "en" }],
    ]);
  });
});

describe("event payloads", () => {
  const tour = { code: "VN-HLB-03", title: "Vịnh Hạ Long", price: 12_900_000 };

  it("carry catalog facts only", () => {
    expect(viewItemList("tours", [tour, { ...tour, code: "VN-SAPA-01", price: null }])).toEqual({
      name: "view_item_list",
      params: {
        item_list_id: "tours",
        item_list_name: "tours",
        items: [
          { item_id: "VN-HLB-03", item_name: "Vịnh Hạ Long", price: 12_900_000, index: 0 },
          { item_id: "VN-SAPA-01", item_name: "Vịnh Hạ Long", index: 1 },
        ],
      },
    });
    expect(viewItem(tour)).toEqual({ name: "view_item", params: { currency: "VND", value: 12_900_000, items: [{ item_id: "VN-HLB-03", item_name: "Vịnh Hạ Long", price: 12_900_000 }] } });
    expect(beginCheckout(tour).name).toBe("begin_checkout");
    expect(generateLead("tailor_made")).toEqual({ name: "generate_lead", params: { lead_source: "tailor_made" } });
  });

  it("purchase carries the hashed transaction id and the amount in VND", () => {
    const event = purchase({ transactionId: "0123456789abcdef0123456789abcdef", value: 25_800_000.4, tour });
    expect(event.params).toMatchObject({ transaction_id: "0123456789abcdef0123456789abcdef", currency: "VND", value: 25_800_000 });
    expect(scrubParams(event.params).transaction_id).toBe("0123456789abcdef0123456789abcdef");
  });

  it("the last guard drops codes, contact details, the consent id and tokens", () => {
    expect(scrubParams({ transaction_id: "PTA-2611-0042" })).toEqual({});
    for (const value of ["PTA-2611-0042", "INQ-2611-0007", "an@example.com", "+84 912 345 678", "0f8b9c1e-2d3a-4b5c-8d6e-7f8091a2b3c4", SAMPLE.token]) {
      expect(unsafeValue(value), value).toBe(true);
      expect(scrubParams({ note: value, items: [{ item_name: value, price: 1 }] })).toEqual({ items: [{ price: 1 }] });
    }
    for (const value of ["VN-HLB-03", "Vịnh Hạ Long 3 ngày 2 đêm", "tours", "tailor_made"]) expect(unsafeValue(value), value).toBe(false);
  });
});
