import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/public", () => ({
  publicEnv: { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS: false },
}));

import { buildDestinationIndex, type DestinationRowData, findInIndex, subtreeIds } from "./destination-public.mapping";

const row = (id: string, parent: string | null, sort: number, name: string, type: DestinationRowData["type"] = "city"): DestinationRowData => ({
  id,
  key: id,
  type,
  parent_id: parent,
  sort_order: sort,
  hero: null,
  destination_translations: [{ slug: `${id}-slug`, name, summary: ` ${name} summary `, best_time_to_visit: null, locale: "vi" }],
});

const rows = [
  row("japan", null, 2, "Nhật Bản", "country"),
  row("vietnam", null, 1, "Việt Nam", "country"),
  row("north", "vietnam", 1, "Miền Bắc", "region"),
  row("central", "vietnam", 2, "Miền Trung", "region"),
  row("halong", "north", 1, "Vịnh Hạ Long"),
  row("hanoi", "north", 0, "Hà Nội"),
  row("orphan", "hidden-parent", 1, "Mồ côi"),
];
const links = [
  { tour_id: "t1", destination_id: "halong" },
  { tour_id: "t1", destination_id: "hanoi" },
  { tour_id: "t2", destination_id: "hanoi" },
  { tour_id: "t3", destination_id: "central" },
  { tour_id: "t4", destination_id: "japan" },
];

describe("buildDestinationIndex", () => {
  const index = buildDestinationIndex(rows, links, "vi");

  it("builds the tree in sort order and leaves out destinations under a hidden parent", () => {
    expect(index.map((node) => node.name)).toEqual(["Việt Nam", "Nhật Bản"]);
    expect(index[0].children.map((node) => node.name)).toEqual(["Miền Bắc", "Miền Trung"]);
    expect(index[0].children[0].children.map((node) => node.name)).toEqual(["Hà Nội", "Vịnh Hạ Long"]);
    expect(JSON.stringify(index)).not.toContain("Mồ côi");
  });

  it("counts distinct tours in each destination and everything below it", () => {
    const north = index[0].children[0];
    expect(north.children.map((node) => node.tourCount)).toEqual([2, 1]);
    expect(north.tourCount).toBe(2); // t1 is in two cities but counts once
    expect(index[0].tourCount).toBe(3);
    expect(index[1].tourCount).toBe(1);
  });

  it("trims texts and finds a node with its ancestors and subtree", () => {
    expect(index[0].summary).toBe("Việt Nam summary");
    const found = findInIndex(index, "halong");
    expect(found?.ancestors.map((node) => node.name)).toEqual(["Việt Nam", "Miền Bắc"]);
    expect(subtreeIds(found!.ancestors[0]).sort()).toEqual(["central", "halong", "hanoi", "north", "vietnam"]);
    expect(findInIndex(index, "orphan")).toBeNull();
  });
});
