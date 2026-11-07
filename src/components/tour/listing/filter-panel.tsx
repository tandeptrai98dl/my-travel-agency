import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { formatMonth } from "@/lib/dates";
import { formatVnd } from "@/lib/money";
import type { FilterDestination, TourFilterOptions } from "@/modules/catalog/public/tour-listing.mapping";
import type { Locale } from "@/modules/catalog/public/types";
import {
  TOUR_DURATIONS,
  TOUR_PRICE_PRESETS,
  TOUR_SCOPES,
  type TourSearchCriteria,
  presetValue,
} from "@/modules/catalog/tour-search-params";

import { FilterSheetClose, FilterSheetForm, FilterSheetReset } from "./filter-sheet";
import { FILTER_PANEL_ID } from "./listing-ids";

type Props = { locale: Locale; criteria: TourSearchCriteria; options: TourFilterOptions; months: string[] };

const boxClass = "h-5 w-5 shrink-0 accent-primary disabled:opacity-60";
const rowClass = "flex min-h-11 cursor-pointer items-center gap-3 text-small has-[:disabled]:cursor-default";
const textInputClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-small text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Group({ legend, children, hint }: { legend: string; children: ReactNode; hint?: string }) {
  return (
    <fieldset className="flex flex-col gap-1 border-t border-border pt-5">
      <legend className="float-left mb-2 w-full text-eyebrow font-semibold uppercase tracking-[0.2em] text-muted-foreground">{legend}</legend>
      {hint && <p className="mb-1 text-small text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Check({ name, value, label, checked, disabled = false, implied }: { name: string; value: string; label: string; checked: boolean; disabled?: boolean; implied?: string }) {
  return (
    <label className={rowClass} title={implied}>
      <input type="checkbox" name={name} value={value} defaultChecked={checked} disabled={disabled} data-implied={disabled ? "" : undefined} className={boxClass} />
      <span>{label}</span>
    </label>
  );
}

function countNodes(nodes: FilterDestination[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
}

/**
 * The listing's filters (docs/specs/tour-listing.md §1.4, §2.6): one fieldset per filter, native
 * inputs, so they work without JavaScript. Rendered twice, in the desktop column and in the mobile
 * sheet (`idPrefix` keeps ids apart), and again after every search (keyed by the query), so their
 * default values are always the URL's.
 */
async function FilterFields({ locale, criteria, options, months, idPrefix }: Props & { idPrefix: string }) {
  const t = await getTranslations({ locale, namespace: "TourListing" });
  const selected = new Set(criteria.dest);
  const price = { min: criteria.priceMin, max: criteria.priceMax };
  const presetIndex = TOUR_PRICE_PRESETS.findIndex((preset) => preset.min === price.min && preset.max === price.max);
  const custom = presetIndex === -1 && (price.min !== null || price.max !== null);
  const money = (amount: number) => formatVnd(amount, locale);
  const presetLabel = (preset: (typeof TOUR_PRICE_PRESETS)[number]) =>
    preset.min === null
      ? t("priceUnder", { max: money(preset.max!) })
      : preset.max === null
        ? t("priceOver", { min: money(preset.min) })
        : t("priceBetween", { min: money(preset.min), max: money(preset.max) });

  const tree = (nodes: FilterDestination[], parent: FilterDestination | null, parentChosen: boolean): ReactNode => (
    <ul className={parent ? "ml-7 flex flex-col" : "flex flex-col"}>
      {nodes.map((node) => {
        const chosen = parentChosen || selected.has(node.key);
        return (
          <li key={node.key} data-name={node.name}>
            <Check
              name="dest"
              value={node.key}
              label={node.name}
              checked={chosen}
              disabled={parentChosen}
              implied={parentChosen && parent ? t("includedInParent", { name: parent.name }) : undefined}
            />
            {node.children.length > 0 && tree(node.children, node, chosen)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <Group legend={t("scope")}>
        {TOUR_SCOPES.map((scope) => (
          <Check key={scope} name="scope" value={scope} label={t(`scopes.${scope}`)} checked={criteria.scopes.includes(scope)} />
        ))}
      </Group>

      {options.destinations.length > 0 && (
        <Group legend={t("destination")}>
          {countNodes(options.destinations) > 10 && (
            // No name: it narrows the list (listing-dom.ts) and never reaches the URL.
            <input
              type="search"
              aria-label={t("destinationSearch")}
              aria-controls={`${idPrefix}-destinations`}
              placeholder={t("destinationSearch")}
              data-filter-list={`${idPrefix}-destinations`}
              autoComplete="off"
              className={`mb-3 h-10 w-full rounded-md border border-input bg-card px-3 text-small text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                // The sheet opens only with JavaScript; the column hides the finder until it runs.
                idPrefix === FILTER_PANEL_ID ? "block" : "hidden [[data-js]_&]:block"
              }`}
            />
          )}
          <div id={`${idPrefix}-destinations`}>{tree(options.destinations, null, false)}</div>
        </Group>
      )}

      {options.styles.length > 0 && (
        <Group legend={t("style")}>
          {options.styles.map((style) => (
            <Check key={style.key} name="style" value={style.key} label={style.name} checked={criteria.style.includes(style.key)} />
          ))}
        </Group>
      )}

      <Group legend={t("price")}>
        {[{ value: "", label: t("priceAny"), checked: presetIndex === -1 && !custom }, ...TOUR_PRICE_PRESETS.map((preset, index) => ({ value: presetValue(preset), label: presetLabel(preset), checked: index === presetIndex }))].map((option) => (
          <label key={option.value || "any"} className={rowClass}>
            <input type="radio" name="price" value={option.value} defaultChecked={option.checked} className={boxClass} />
            <span>{option.label}</span>
          </label>
        ))}
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-small">
            {t("priceMin")}
            <input type="text" name="price_min" inputMode="numeric" autoComplete="off" defaultValue={custom && price.min !== null ? String(price.min) : ""} className={textInputClass} />
          </label>
          <label className="flex flex-col gap-1 text-small">
            {t("priceMax")}
            <input type="text" name="price_max" inputMode="numeric" autoComplete="off" defaultValue={custom && price.max !== null ? String(price.max) : ""} className={textInputClass} />
          </label>
        </div>
      </Group>

      <Group legend={t("month")} hint={t("monthHint")}>
        <div className="grid grid-cols-2 gap-x-4">
          {months.map((month) => (
            <Check key={month} name="month" value={month} label={formatMonth(month, locale)} checked={criteria.months.includes(month)} />
          ))}
        </div>
      </Group>

      <Group legend={t("duration")}>
        {TOUR_DURATIONS.map((duration) => (
          <Check key={duration} name="duration" value={duration} label={t(`durations.${duration}`)} checked={criteria.durations.includes(duration)} />
        ))}
      </Group>
    </>
  );
}

const COLUMN_ID = "tour-filters-column";

/**
 * The filter column (from `lg`, and on every width without JavaScript): a plain region inside the
 * listing form. With JavaScript a change applies at once, so its Apply button is hidden.
 */
export async function FilterColumn(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: "TourListing" });
  return (
    <section aria-labelledby={`${COLUMN_ID}-title`} className="filter-column flex flex-col gap-5">
      <h2 id={`${COLUMN_ID}-title`} className="font-serif text-h4 font-semibold">
        {t("filters")}
      </h2>
      <FilterFields {...props} idPrefix={COLUMN_ID} />
      <div className="filter-apply flex border-t border-border py-4">
        <button type="submit" className={buttonVariants({ className: "ml-auto" })}>
          {t("apply")}
        </button>
      </div>
    </section>
  );
}

/**
 * The filter sheet below `lg` (native modal `<dialog>`, opened by FilterSheetButton): full screen on
 * phones, a right-hand panel on tablets. Rendered after the listing form with a form of its own;
 * choices are staged until Apply, Reset clears them and closing drops them.
 */
export async function FilterSheet(props: Props & { action: string }) {
  const { action, ...fields } = props;
  const t = await getTranslations({ locale: props.locale, namespace: "TourListing" });
  return (
    <dialog id={FILTER_PANEL_ID} aria-labelledby={`${FILTER_PANEL_ID}-title`} className="filter-sheet">
      <FilterSheetForm action={action} className="flex min-h-full flex-col gap-5 px-5 pt-3">
        <div className="flex items-center justify-between gap-4">
          <h2 id={`${FILTER_PANEL_ID}-title`} className="font-serif text-h4 font-semibold">
            {t("filters")}
          </h2>
          <div className="-mr-3">
            <FilterSheetClose label={t("close")} />
          </div>
        </div>
        <FilterFields {...fields} idPrefix={FILTER_PANEL_ID} />
        <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 border-t border-border bg-background py-4">
          <FilterSheetReset label={t("reset")} />
          <button type="submit" className={buttonVariants({ className: "ml-auto" })}>
            {t("apply")}
          </button>
        </div>
      </FilterSheetForm>
    </dialog>
  );
}
