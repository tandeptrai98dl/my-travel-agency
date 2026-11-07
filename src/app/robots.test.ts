import { describe, expect, it } from "vitest";

import robots from "./robots";

describe("robots.txt", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

  it("keeps private, transactional and filtered pages out of crawls in both languages", () => {
    expect(rules.disallow).toEqual(
      expect.arrayContaining([
        "/admin",
        "/api/",
        "/auth/",
        "/tai-khoan",
        "/en/account",
        "/dat-tour/",
        "/en/book/",
        "/thanh-toan/",
        "/en/checkout/",
        "/en/pay/",
        "/tra-cuu-booking",
        "/en/booking-lookup",
        "/tim-kiem",
        "/en/search",
        "/tours?",
        "/en/tours?",
      ]),
    );
  });

  it("lets unfiltered paged listings through and names the sitemap", () => {
    expect(rules.allow).toEqual(expect.arrayContaining(["/", "/tours?page=", "/en/tours?page="]));
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
