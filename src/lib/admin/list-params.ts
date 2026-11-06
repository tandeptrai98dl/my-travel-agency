import { z } from "zod";

/**
 * Admin list pages keep their state in the URL (`?page=&sort=&dir=&q=` plus filters), so lists
 * are linkable, work without JavaScript and survive a reload. Every value is validated here;
 * anything unknown falls back to the default instead of failing the page.
 */
export type SortDirection = "asc" | "desc";

export type ListParams<S extends string> = {
  page: number;
  pageSize: number;
  sort: S;
  dir: SortDirection;
  q: string;
  filters: Record<string, string>;
};

type Options<S extends string> = {
  sortable: readonly [S, ...S[]];
  defaultSort: S;
  defaultDir?: SortDirection;
  pageSize?: number;
  /** Filter names and their allowed values (`null` = any short string). */
  filters?: Record<string, readonly string[] | null>;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseListParams<S extends string>(raw: RawParams, options: Options<S>): ListParams<S> {
  const page = z.coerce.number().int().min(1).max(10_000).catch(1).parse(first(raw.page) ?? 1);
  const sort = z.enum(options.sortable).catch(options.defaultSort).parse(first(raw.sort));
  const dir = z
    .enum(["asc", "desc"])
    .catch(options.defaultDir ?? "asc")
    .parse(first(raw.dir));
  const q = (first(raw.q) ?? "").trim().slice(0, 100);

  const filters: Record<string, string> = {};
  for (const [name, allowed] of Object.entries(options.filters ?? {})) {
    const value = first(raw[name])?.trim();
    if (!value) continue;
    if (allowed === null ? value.length <= 100 : allowed.includes(value)) filters[name] = value;
  }

  return { page, pageSize: options.pageSize ?? 25, sort, dir, q, filters };
}

/** Builds a list URL from the current params with some values replaced (null removes one). */
export function listHref(
  basePath: string,
  current: Record<string, string | undefined>,
  overrides: Record<string, string | number | null>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) if (value) params.set(key, value);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  if (params.get("page") === "1") params.delete("page");
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** The URL-facing values of parsed params (defaults left out), for building links. */
export function currentQuery<S extends string>(
  params: ListParams<S>,
  defaults: { sort: S; dir: SortDirection },
): Record<string, string | undefined> {
  return {
    q: params.q || undefined,
    sort: params.sort === defaults.sort && params.dir === defaults.dir ? undefined : params.sort,
    dir: params.sort === defaults.sort && params.dir === defaults.dir ? undefined : params.dir,
    page: params.page > 1 ? String(params.page) : undefined,
    ...params.filters,
  };
}

/** Postgres range for PostgREST `.range(from, to)` (inclusive). */
export function pageRange(params: { page: number; pageSize: number }): [number, number] {
  const from = (params.page - 1) * params.pageSize;
  return [from, from + params.pageSize - 1];
}
