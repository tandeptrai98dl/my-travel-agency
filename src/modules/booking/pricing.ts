import { addDays, daysBetween, type IsoDate } from "@/lib/dates";
import { assertDong, type Dong, percentOf, sum, times } from "@/lib/money";

/**
 * Booking prices (docs/specs/phase-4-booking-payments.md decision 1, ADR-011, ADR-016). Pure and
 * integer-only: the server prices every step from the departure and the tour, and the browser
 * never sends a price. `reserve_and_create_payment()` refuses a hold whose unit prices no longer
 * match the departure (decision 2), so these lines are what the customer pays.
 */

export type DeparturePrices = {
  startDate: IsoDate;
  capacity: number;
  seatsReserved: number;
  priceAdult: Dong;
  priceChild: Dong | null;
  priceInfant: Dong | null;
  singleSupplement: Dong | null;
};

export type TourTerms = {
  minPax: number;
  maxPax: number | null;
  depositPercent: number;
  balanceDueDays: number;
};

export type Party = { adults: number; children: number; infants: number; singleRooms: number };
export type PaymentPlan = "deposit" | "full";
export type LineType = "adult" | "child" | "infant" | "single_supplement";
export type PriceLine = { type: LineType; unitPrice: Dong; quantity: number; amount: Dong };

export type PartyError =
  | "noAdult"
  | "tooManyInfants"
  | "tooFewTravellers"
  | "tooManyTravellers"
  | "notEnoughSeats"
  | "tooManySingleRooms"
  | "notWholeNumbers";

export type Quote = {
  lines: PriceLine[];
  subtotal: Dong;
  total: Dong;
  /** The deposit the plan asks for now (the total for the full plan). */
  deposit: Dong;
  plans: PaymentPlan[];
  plan: PaymentPlan;
  /** Null when the full price is due now. */
  balanceDueDate: IsoDate | null;
  seats: number;
};

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: PartyError | "planUnavailable" };

/** Deposits are rounded up to the next 1 000 đ and never exceed the total. */
export const DEPOSIT_ROUNDING: Dong = 1_000;

export function seatsFor(party: Party): number {
  // Infants do not take a seat (ADR-016).
  return party.adults + party.children;
}

export function checkParty(party: Party, departure: DeparturePrices, tour: TourTerms): PartyError | null {
  const values = [party.adults, party.children, party.infants, party.singleRooms];
  if (!values.every((value) => Number.isSafeInteger(value) && value >= 0)) return "notWholeNumbers";
  if (party.adults < 1) return "noAdult";
  // At most one infant per two adults (ADR-016, bookings check constraint).
  if (party.infants * 2 > party.adults) return "tooManyInfants";
  const seats = seatsFor(party);
  if (seats < tour.minPax) return "tooFewTravellers";
  if (tour.maxPax !== null && seats > tour.maxPax) return "tooManyTravellers";
  if (seats > departure.capacity - departure.seatsReserved) return "notEnoughSeats";
  if (party.singleRooms > party.adults) return "tooManySingleRooms";
  return null;
}

/** Deposit plan only while the balance would still be due after today (Vietnam date). */
export function availablePlans(departure: Pick<DeparturePrices, "startDate">, tour: Pick<TourTerms, "balanceDueDays" | "depositPercent">, today: IsoDate): PaymentPlan[] {
  const daysAway = daysBetween(today, departure.startDate);
  const depositPossible = tour.depositPercent > 0 && tour.depositPercent < 100 && daysAway > tour.balanceDueDays;
  return depositPossible ? ["deposit", "full"] : ["full"];
}

export function depositFor(total: Dong, percent: number): Dong {
  const raw = percentOf(total, percent);
  const rounded = Math.ceil(raw / DEPOSIT_ROUNDING) * DEPOSIT_ROUNDING;
  return assertDong(Math.min(rounded, total));
}

export function priceLines(party: Party, departure: DeparturePrices): PriceLine[] {
  const line = (type: LineType, unitPrice: Dong, quantity: number): PriceLine[] =>
    quantity > 0 ? [{ type, unitPrice: assertDong(unitPrice), quantity, amount: times(unitPrice, quantity) }] : [];
  return [
    ...line("adult", departure.priceAdult, party.adults),
    ...line("child", departure.priceChild ?? departure.priceAdult, party.children),
    ...line("infant", departure.priceInfant ?? 0, party.infants),
    ...line("single_supplement", departure.singleSupplement ?? 0, party.singleRooms),
  ];
}

export function priceBooking(
  departure: DeparturePrices,
  tour: TourTerms,
  party: Party,
  plan: PaymentPlan,
  today: IsoDate,
): QuoteResult {
  const error = checkParty(party, departure, tour);
  if (error) return { ok: false, error };
  const plans = availablePlans(departure, tour, today);
  if (!plans.includes(plan)) return { ok: false, error: "planUnavailable" };
  const lines = priceLines(party, departure);
  const subtotal = sum(lines.map((item) => item.amount));
  const total = subtotal;
  return {
    ok: true,
    quote: {
      lines,
      subtotal,
      total,
      deposit: plan === "deposit" ? depositFor(total, tour.depositPercent) : total,
      plans,
      plan,
      balanceDueDate: plan === "deposit" ? addDays(departure.startDate, -tour.balanceDueDays) : null,
      seats: seatsFor(party),
    },
  };
}
