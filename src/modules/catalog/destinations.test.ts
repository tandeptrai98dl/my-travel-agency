import { describe, expect, it } from "vitest";

import { buildDestinationTree, type DestinationRow } from "./destinations";

const row = (overrides: Partial<DestinationRow> & Pick<DestinationRow, "id" | "key">): DestinationRow => ({
  type: "country",
  parentId: null,
  sortOrder: 0,
  slug: overrides.key,
  name: overrides.key,
  ...overrides,
});

describe("buildDestinationTree", () => {
  it("nests countries, regions and cities in sort order", () => {
    const tree = buildDestinationTree([
      row({ id: "c2", key: "japan", sortOrder: 2 }),
      row({ id: "c1", key: "vietnam", sortOrder: 1 }),
      row({ id: "r1", key: "northern-vietnam", type: "region", parentId: "c1" }),
      row({ id: "t2", key: "sapa", type: "city", parentId: "r1", sortOrder: 2 }),
      row({ id: "t1", key: "hanoi", type: "city", parentId: "r1", sortOrder: 1 }),
    ]);
    expect(tree.map((n) => n.key)).toEqual(["vietnam", "japan"]);
    expect(tree[0]!.children[0]!.children.map((n) => n.key)).toEqual(["hanoi", "sapa"]);
  });

  it("drops subtrees whose parent is not published in this language", () => {
    const tree = buildDestinationTree([
      row({ id: "c1", key: "vietnam" }),
      row({ id: "t1", key: "hanoi", type: "city", parentId: "r-missing" }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toEqual([]);
  });
});
