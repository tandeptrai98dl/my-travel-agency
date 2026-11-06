import { describe, expect, it } from "vitest";

import { currentQuery, listHref, pageRange, parseListParams } from "./list-params";

const options = {
  sortable: ["created_at", "action"] as const,
  defaultSort: "created_at" as const,
  defaultDir: "desc" as const,
  filters: { entity: ["tours", "settings"], actor: null },
};

describe("parseListParams", () => {
  it("reads valid values", () => {
    expect(
      parseListParams({ page: "3", sort: "action", dir: "asc", q: " hạ long ", entity: "tours" }, options),
    ).toEqual({
      page: 3,
      pageSize: 25,
      sort: "action",
      dir: "asc",
      q: "hạ long",
      filters: { entity: "tours" },
    });
  });

  it("falls back to defaults for anything unknown or hostile", () => {
    const params = parseListParams(
      { page: "-2", sort: "password", dir: "sideways", entity: "profiles", q: "x".repeat(500) },
      options,
    );
    expect(params.page).toBe(1);
    expect(params.sort).toBe("created_at");
    expect(params.dir).toBe("desc");
    expect(params.filters).toEqual({});
    expect(params.q).toHaveLength(100);
  });

  it("takes the first value of repeated params", () => {
    expect(parseListParams({ page: ["2", "9"] }, options).page).toBe(2);
  });
});

describe("listHref / currentQuery / pageRange", () => {
  it("keeps current filters, replaces values and drops page 1", () => {
    expect(listHref("/admin/audit-log", { q: "tour", page: "4" }, { page: 1 })).toBe("/admin/audit-log?q=tour");
    expect(listHref("/admin/audit-log", { q: "tour" }, { q: null })).toBe("/admin/audit-log");
    expect(listHref("/admin/x", {}, { sort: "action", dir: "asc" })).toBe("/admin/x?sort=action&dir=asc");
  });

  it("leaves defaults out of the URL", () => {
    const params = parseListParams({ entity: "tours" }, options);
    expect(currentQuery(params, { sort: "created_at", dir: "desc" })).toEqual({
      q: undefined,
      sort: undefined,
      dir: undefined,
      page: undefined,
      entity: "tours",
    });
  });

  it("maps a page to an inclusive row range", () => {
    expect(pageRange({ page: 1, pageSize: 25 })).toEqual([0, 24]);
    expect(pageRange({ page: 3, pageSize: 25 })).toEqual([50, 74]);
  });
});
