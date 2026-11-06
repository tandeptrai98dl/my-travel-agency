import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { loadMessages } from "./messages";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale: explicitLocale, requestLocale }) => {
  // An explicit locale (e.g. getTranslations({ locale: "vi" }) in the admin) wins over the route.
  const requested = explicitLocale ?? (await requestLocale);
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    timeZone: "Asia/Ho_Chi_Minh",
    messages: await loadMessages(locale),
  };
});
