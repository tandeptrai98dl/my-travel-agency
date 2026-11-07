import { describe, expect, it } from "vitest";

import { createNavigation } from "next-intl/navigation";

import { pathnames } from "./pathnames";
import { currentRoute, internalRoute, localizedPath, splitLocale, switchLocalePath } from "./paths";
import { routing } from "./routing";

// next-intl's own implementation, as the reference.
const { getPathname } = createNavigation(routing);

const LOCALES = ["vi", "en"] as const;

function sampleParams(internal: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [, name] of internal.matchAll(/\[([^\]]+)\]/g)) params[name] = `sample-${name.toLowerCase()}`;
  return params;
}

describe("client-safe localized paths", () => {
  it.each(Object.keys(pathnames))("%s matches next-intl's getPathname in both languages", (internal) => {
    const params = sampleParams(internal);
    const href = { pathname: internal, params };
    for (const locale of LOCALES) {
      // @ts-expect-error -- every internal path with its own params, typed loosely for the loop.
      const expected = getPathname({ href, locale });
      expect(localizedPath(locale, href)).toBe(expected);
    }
  });

  it.each(Object.keys(pathnames))("%s maps back to its internal route", (internal) => {
    const params = sampleParams(internal);
    for (const locale of LOCALES) {
      const { path } = splitLocale(localizedPath(locale, { pathname: internal, params }));
      expect(internalRoute(locale, path)).toEqual({ pathname: internal, params });
    }
  });

  it("adds a query and encodes params", () => {
    expect(localizedPath("en", { pathname: "/tours", query: { dest: "vietnam", month: "2027-03" } })).toBe(
      "/en/tours?dest=vietnam&month=2027-03",
    );
    expect(localizedPath("vi", { pathname: "/tours/[slug]", params: { slug: "a b/c" } })).toBe("/tours/a%20b%2Fc");
  });

  it("switches the current page to the other language, keeping localized segments", () => {
    expect(switchLocalePath("/diem-den/ha-long-bay", "en")).toBe("/en/destinations/ha-long-bay");
    expect(switchLocalePath("/en/destinations/ha-long-bay", "vi")).toBe("/diem-den/ha-long-bay");
    expect(switchLocalePath("/en", "vi")).toBe("/");
    expect(switchLocalePath("/", "en")).toBe("/en");
    expect(switchLocalePath("/en/checkout/PTA-2611-0042/payment", "vi")).toBe("/thanh-toan/PTA-2611-0042/phuong-thuc");
  });

  it("understands the proxy's internal Vietnamese paths that usePathname() gives while prerendering", () => {
    expect(switchLocalePath("/vi/contact", "en")).toBe("/en/contact");
    expect(switchLocalePath("/vi/contact", "vi")).toBe("/lien-he");
    expect(switchLocalePath("/vi/destinations/ha-long-bay", "en")).toBe("/en/destinations/ha-long-bay");
    expect(switchLocalePath("/vi", "en")).toBe("/en");
    expect(switchLocalePath("/vi/tailor-made", "en")).toBe("/en/tailor-made");
    expect(currentRoute("/vi")).toEqual({ locale: "vi", pathname: "/", params: {} });
    expect(currentRoute("/")).toEqual({ locale: "vi", pathname: "/", params: {} });
    expect(currentRoute("/en")).toEqual({ locale: "en", pathname: "/", params: {} });
    expect(currentRoute("/vi/tours/du-thuyen")).toEqual({ locale: "vi", pathname: "/tours/[slug]", params: { slug: "du-thuyen" } });
  });

  it("keeps an unknown path (e.g. a 404) as it is", () => {
    expect(switchLocalePath("/khong-co-trang-nay", "en")).toBe("/en/khong-co-trang-nay");
    expect(switchLocalePath("/en/nowhere", "vi")).toBe("/nowhere");
  });

  it("does not take /english as the English prefix", () => {
    expect(splitLocale("/english")).toEqual({ locale: "vi", path: "/english" });
  });
});
