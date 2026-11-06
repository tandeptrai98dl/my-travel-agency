import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getPathname } from "@/i18n/navigation";
import { formatMonth, type IsoMonth } from "@/lib/dates";
import type { DestinationNode } from "@/modules/catalog/destinations";
import type { Locale } from "@/modules/catalog/public/types";

type Props = { locale: Locale; destinations: DestinationNode[]; styles: { key: string; name: string }[]; months: IsoMonth[] };

// The bar is a white surface inside the navy hero, so it uses the brand colours directly: the
// semantic tokens are re-mapped for navy there (`.theme-navy`). Navy on white is 17:1, the warm
// gray field border 3.6:1 and the navy focus ring 17:1 (WCAG 1.4.3, 1.4.11).
const fieldClass =
  "h-12 w-full min-w-0 appearance-none rounded-md border border-warm-gray bg-white pl-3 pr-9 text-body text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 focus-visible:ring-offset-white";
const labelClass = "text-eyebrow font-semibold uppercase text-navy";

/**
 * The hero's search bar (decision 18): a plain GET form to the tour listing with `dest`, `month`
 * and `style`, so it works without JavaScript. Native selects keep it keyboard and screen-reader
 * friendly on every device.
 */
export async function HeroSearch({ locale, destinations, styles, months }: Props) {
  const t = await getTranslations({ locale, namespace: "Home.hero" });
  return (
    <form
      role="search"
      aria-label={t("searchLabel")}
      action={getPathname({ locale, href: "/tours" })}
      method="get"
      className="grid w-full max-w-5xl gap-4 rounded-lg bg-white p-4 text-navy md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end md:p-5"
      style={{ colorScheme: "light" }}
    >
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={labelClass}>{t("destination")}</span>
        <span className="relative">
          <select name="dest" defaultValue="" className={fieldClass}>
            <option value="">{t("anyDestination")}</option>
            {destinations.map((country) => (
              <optgroup key={country.key} label={country.name}>
                <option value={country.key}>{country.name}</option>
                {country.children.map((region) => (
                  <option key={region.key} value={region.key}>
                    {region.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={labelClass}>{t("month")}</span>
        <span className="relative">
          <select name="month" defaultValue="" className={fieldClass}>
            <option value="">{t("anyMonth")}</option>
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonth(month, locale)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={labelClass}>{t("style")}</span>
        <span className="relative">
          <select name="style" defaultValue="" className={fieldClass}>
            <option value="">{t("anyStyle")}</option>
            {styles.map((style) => (
              <option key={style.key} value={style.key}>
                {style.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </label>
      <button
        type="submit"
        className="inline-flex h-12 w-full items-center justify-center whitespace-nowrap rounded-md bg-navy px-8 text-small font-medium tracking-wide text-ivory transition-colors duration-200 ease-luxe hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 focus-visible:ring-offset-white md:w-auto"
      >
        {t("submit")}
      </button>
    </form>
  );
}
