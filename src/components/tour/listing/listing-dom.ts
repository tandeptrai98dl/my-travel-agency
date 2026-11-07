import { parseTourSearchParams, serializeTourSearchParams } from "@/modules/catalog/tour-search-params";

/**
 * Browser helpers shared by the listing's form (desktop column) and the mobile sheet's form:
 * reading the search out of forms, the destination tree, the price inputs and the destination
 * finder. Plain DOM, no React.
 */

/** Names the toolbar owns (search and sort); the filters come from the column or the sheet. */
const TOOLBAR = new Set(["q", "sort"]);

/**
 * The canonical query of a search (page 1): the toolbar's values from the listing form and the
 * filters from `filters` (the sheet's own form; by default the listing form's column).
 */
export function searchQuery(listing: HTMLFormElement, filters: HTMLFormElement = listing): string {
  const params = new URLSearchParams();
  const add = (form: HTMLFormElement, keep: (name: string) => boolean) => {
    for (const [name, value] of new FormData(form)) if (typeof value === "string" && value !== "" && keep(name)) params.append(name, value);
  };
  if (filters === listing) add(listing, () => true);
  else {
    add(listing, (name) => TOOLBAR.has(name));
    add(filters, (name) => !TOOLBAR.has(name));
  }
  return serializeTourSearchParams({ ...parseTourSearchParams(params), page: 1 });
}

/**
 * After a filter input changed: a country or region includes the places below it (they show as
 * chosen and step aside), and a price preset and typed amounts clear each other. Returns whether
 * the change is part of the search (helpers without a name, like the finder, are not).
 */
export function syncFilters(form: HTMLFormElement, target: HTMLInputElement): boolean {
  if (!target.name) return false;
  if (target.name === "price") {
    for (const name of ["price_min", "price_max"]) {
      const input = form.elements.namedItem(name) as HTMLInputElement | null;
      if (input) input.value = "";
    }
  } else if (target.name === "dest" && target.closest("li")) {
    target
      .closest("li")!
      .querySelectorAll<HTMLInputElement>(":scope > ul input[name='dest']")
      .forEach((child) => {
        child.checked = target.checked;
        child.disabled = target.checked;
      });
  } else if (target.name === "price_min" || target.name === "price_max") {
    form.querySelectorAll<HTMLInputElement>('input[name="price"]').forEach((radio) => {
      radio.checked = radio.value === "";
    });
  }
  return true;
}

/** Folds case and Vietnamese diacritics (đ included) for matching. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
}

/**
 * The destination finder (an input with `data-filter-list`, shown above long lists) hides the
 * rows that do not match; ancestors of a match stay visible and hidden rows keep their choice.
 */
export function filterList(input: HTMLInputElement) {
  const list = document.getElementById(input.dataset.filterList ?? "");
  if (!list) return;
  const term = fold(input.value);
  const rows = [...list.querySelectorAll<HTMLLIElement>("li")];
  const visible = new Set<HTMLElement>();
  for (const row of rows) {
    if (term && !fold(row.dataset.name ?? "").includes(term)) continue;
    for (let node: HTMLElement | null = row; node && node !== list; node = node.parentElement) visible.add(node);
  }
  for (const row of rows) row.hidden = !visible.has(row);
}

/** Runs the finder for `input` events from a filter form. */
export function onFinderInput(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.dataset.filterList) filterList(target);
}
