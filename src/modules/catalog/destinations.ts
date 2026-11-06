export type DestinationRow = {
  id: string;
  key: string;
  type: "country" | "region" | "city";
  parentId: string | null;
  sortOrder: number;
  slug: string;
  name: string;
};

export type DestinationNode = {
  key: string;
  type: DestinationRow["type"];
  slug: string;
  name: string;
  children: DestinationNode[];
};

/**
 * Builds the destination tree from flat rows. Rows whose parent is missing (unpublished or not
 * translated) are dropped with their subtree, so the menu never links to a hidden page.
 */
export function buildDestinationTree(rows: readonly DestinationRow[]): DestinationNode[] {
  const byParent = new Map<string | null, DestinationRow[]>();
  for (const row of rows) {
    const siblings = byParent.get(row.parentId) ?? [];
    siblings.push(row);
    byParent.set(row.parentId, siblings);
  }

  const build = (parentId: string | null): DestinationNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((row) => ({
        key: row.key,
        type: row.type,
        slug: row.slug,
        name: row.name,
        children: build(row.id),
      }));

  return build(null);
}
