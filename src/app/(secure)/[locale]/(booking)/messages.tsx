import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/** Only the booking strings reach the client components of these pages. */
export async function BookingMessages({ locale, children }: { locale: "vi" | "en"; children: React.ReactNode }) {
  const messages = await getMessages({ locale });
  return (
    <NextIntlClientProvider locale={locale} messages={{ Booking: messages.Booking, Checkout: messages.Checkout }}>
      {children}
    </NextIntlClientProvider>
  );
}
