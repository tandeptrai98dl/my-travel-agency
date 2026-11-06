import { getRequestConfig } from "next-intl/server";

import { loadMessages } from "./messages";
import { isLocale, routing } from "./routing";

export default getRequestConfig(async ({ locale: explicitLocale, requestLocale }) => {
  // An explicit locale (e.g. getTranslations({ locale: "vi" }) in the admin) wins over the route.
  const requested = explicitLocale ?? (await requestLocale);
  const locale = isLocale(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    timeZone: "Asia/Ho_Chi_Minh",
    messages: await loadMessages(locale),
  };
});
