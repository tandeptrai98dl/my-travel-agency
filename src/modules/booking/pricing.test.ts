import { describe, expect, it } from "vitest";

import { availablePlans, depositFor, priceBooking, type DeparturePrices, type TourTerms } from "./pricing";

const departure: DeparturePrices = {
  startDate: "2027-03-20",
  capacity: 12,
  seatsReserved: 8,
  priceAdult: 12_900_000,
  priceChild: 9_900_000,
  priceInfant: null,
  singleSupplement: 2_500_000,
};
const tour: TourTerms = { minPax: 1, maxPax: 10, depositPercent: 30, balanceDueDays: 30 };
const party = { adults: 2, children: 1, infants: 1, singleRooms: 1 };

describe("priceBooking", () => {
  it("prices adults, children, infants and single rooms in whole dong", () => {
    const result = priceBooking(departure, tour, party, "deposit", "2027-01-10");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.lines).toEqual([
      { type: "adult", unitPrice: 12_900_000, quantity: 2, amount: 25_800_000 },
      { type: "child", unitPrice: 9_900_000, quantity: 1, amount: 9_900_000 },
      { type: "infant", unitPrice: 0, quantity: 1, amount: 0 },
      { type: "single_supplement", unitPrice: 2_500_000, quantity: 1, amount: 2_500_000 },
    ]);
    expect(result.quote.total).toBe(38_200_000);
    // 30 % = 11 460 000, already a multiple of 1 000.
    expect(result.quote.deposit).toBe(11_460_000);
    expect(result.quote.balanceDueDate).toBe("2027-02-18");
    expect(result.quote.seats).toBe(3);
  });

  it("charges children the adult price when there is no child price", () => {
    const result = priceBooking({ ...departure, priceChild: null }, tour, party, "full", "2027-01-10");
    expect(result.ok && result.quote.lines[1]).toEqual({ type: "child", unitPrice: 12_900_000, quantity: 1, amount: 12_900_000 });
    expect(result.ok && result.quote.deposit).toBe(result.ok && result.quote.total);
    expect(result.ok && result.quote.balanceDueDate).toBeNull();
  });

  it("refuses parties outside the rules", () => {
    const check = (patch: Partial<typeof party>) => {
      const result = priceBooking(departure, tour, { ...party, ...patch }, "full", "2027-01-10");
      return result.ok ? null : result.error;
    };
    expect(check({ adults: 0, infants: 0, singleRooms: 0 })).toBe("noAdult");
    expect(check({ infants: 2 })).toBe("tooManyInfants");
    expect(check({ adults: 4, children: 1 })).toBe("notEnoughSeats");
    expect(check({ singleRooms: 3 })).toBe("tooManySingleRooms");
    expect(check({ adults: 1.5 })).toBe("notWholeNumbers");
    expect(priceBooking(departure, { ...tour, minPax: 4 }, party, "full", "2027-01-10")).toEqual({ ok: false, error: "tooFewTravellers" });
    expect(priceBooking({ ...departure, capacity: 40 }, { ...tour, maxPax: 2 }, party, "full", "2027-01-10")).toEqual({
      ok: false,
      error: "tooManyTravellers",
    });
    // Infants never take a seat: 3 seats left fit 2 adults, 1 child and 1 infant.
    expect(check({})).toBeNull();
  });

  it("offers the deposit plan only while the balance is not yet due", () => {
    expect(availablePlans(departure, tour, "2027-02-17")).toEqual(["deposit", "full"]);
    expect(availablePlans(departure, tour, "2027-02-18")).toEqual(["full"]);
    expect(availablePlans(departure, { ...tour, depositPercent: 100 }, "2027-01-01")).toEqual(["full"]);
    expect(priceBooking(departure, tour, party, "deposit", "2027-03-01")).toEqual({ ok: false, error: "planUnavailable" });
  });
});

describe("depositFor", () => {
  it("rounds up to the next 1 000 đ and never exceeds the total", () => {
    expect(depositFor(12_345_678, 30)).toBe(3_704_000);
    expect(depositFor(1_500, 99)).toBe(1_500);
    expect(depositFor(0, 30)).toBe(0);
  });
});
