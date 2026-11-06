import type { Departure, TourPage } from "@/modules/catalog/public/tour-public.service";

/**
 * `Product` + `TouristTrip` for a tour (Phase 3 spec decision 10). Group tours carry an
 * `AggregateOffer` over bookable departures (rendered in the live section); private tours an
 * indicative "from" offer. No AggregateRating until verified reviews (P1).
 */
export function tourJsonLd(tour: TourPage, url: string, departures: Departure[]): Record<string, unknown> {
  const bookable = departures.filter((departure) => departure.bookable);
  const prices = bookable.map((departure) => departure.priceAdult);
  let offers: Record<string, unknown> | undefined;
  if (tour.type === "private" && tour.fromPrice > 0) {
    offers = {
      "@type": "Offer",
      url,
      priceCurrency: "VND",
      price: tour.fromPrice,
      priceSpecification: { "@type": "PriceSpecification", priceCurrency: "VND", minPrice: tour.fromPrice },
      availability: "https://schema.org/InStock",
    };
  } else if (prices.length) {
    offers = {
      "@type": "AggregateOffer",
      url,
      priceCurrency: "VND",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: prices.length,
      availability: "https://schema.org/InStock",
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": ["Product", "TouristTrip"],
    name: tour.title,
    description: tour.seoDescription ?? tour.summary,
    url,
    sku: tour.code,
    image: [tour.hero, ...tour.gallery].filter((image) => image !== null).slice(0, 5).map((image) => image.src),
    touristType: tour.styles.map((style) => style.name),
    itinerary: tour.itinerary.length
      ? {
          "@type": "ItemList",
          numberOfItems: tour.itinerary.length,
          itemListElement: tour.itinerary.map((day) => ({
            "@type": "ListItem",
            position: day.day,
            name: day.title,
            description: day.description || undefined,
          })),
        }
      : undefined,
    offers,
  };
}
