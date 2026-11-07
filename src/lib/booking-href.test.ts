import { describe, expect, it } from "vitest";

import { bookingHref } from "./booking-href";

describe("bookingHref", () => {
  it("builds the localized booking path with the tour page's choices", () => {
    expect(bookingHref("vi", "vinh-ha-long")).toBe("/dat-tour/vinh-ha-long");
    expect(bookingHref("en", "ha-long-bay", { departureId: "0f8fad5b-d9cb-469f-a165-70867728950e", adults: 2, children: 1 })).toBe(
      "/en/book/ha-long-bay?departure=0f8fad5b-d9cb-469f-a165-70867728950e&adults=2&children=1",
    );
  });
});
