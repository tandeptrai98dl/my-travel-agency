import type { ImageData } from "@/lib/images";

import { toImage, type MediaRow } from "./tour-public.mapping";
import type { Locale } from "./types";

/** Pure mapping of public destination rows (unit-tested; no I/O). */

export type DestinationRowData = {
  id: string;
  key: string;
  type: "country" | "region" | "city";
  parent_id: string | null;
  sort_order: number;
  hero: MediaRow | null;
  destination_translations: { slug: string; name: string; summary: string | null; best_time_to_visit: string | null; locale: string }[];
};

export type DestinationSummary = {
  id: string;
  key: string;
  type: DestinationRowData["type"];
  slug: string;
  name: string;
  summary: string | null;
  bestTime: string | null;
  image: ImageData | null;
  /** Tours listed in this language here or in any destination below. */
  tourCount: number;
  children: DestinationSummary[];
};

const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

/**
 * Published destinations as a tree with tour counts. A destination whose parent is hidden
 * (unpublished or not translated) is left out with its subtree, like the menu tree. Counts are
 * distinct tours in the destination and every destination below it.
 */
export function buildDestinationIndex(
  rows: DestinationRowData[],
  links: { tour_id: string; destination_id: string }[],
  locale: Locale,
): DestinationSummary[] {
  const byParent = new Map<string | null, DestinationRowData[]>();
  for (const row of rows) {
    if (!row.destination_translations[0]) continue;
    byParent.set(row.parent_id, [...(byParent.get(row.parent_id) ?? []), row]);
  }
  const toursAt = new Map<string, Set<string>>();
  for (const link of links) toursAt.set(link.destination_id, (toursAt.get(link.destination_id) ?? new Set()).add(link.tour_id));

  function build(parent: string | null, seen: Set<string>): { nodes: DestinationSummary[]; tours: Set<string> } {
    const all = new Set<string>();
    const siblings = [...(byParent.get(parent) ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const nodes = siblings.flatMap((row) => {
      if (seen.has(row.id)) return [];
      const translation = row.destination_translations[0];
      const below = build(row.id, new Set(seen).add(row.id));
      const tours = new Set([...(toursAt.get(row.id) ?? []), ...below.tours]);
      tours.forEach((id) => all.add(id));
      return [
        {
          id: row.id,
          key: row.key,
          type: row.type,
          slug: translation.slug,
          name: translation.name,
          summary: text(translation.summary),
          bestTime: text(translation.best_time_to_visit),
          image: toImage(row.hero, locale),
          tourCount: tours.size,
          children: below.nodes,
        },
      ];
    });
    return { nodes, tours: all };
  }
  return build(null, new Set()).nodes;
}

/** Finds a node and its ancestors (country first) in the index. */
export function findInIndex(index: DestinationSummary[], id: string): { node: DestinationSummary; ancestors: DestinationSummary[] } | null {
  for (const node of index) {
    if (node.id === id) return { node, ancestors: [] };
    const found = findInIndex(node.children, id);
    if (found) return { node: found.node, ancestors: [node, ...found.ancestors] };
  }
  return null;
}

/** Every id in a subtree (the destination and its descendants). */
export function subtreeIds(node: DestinationSummary): string[] {
  return [node.id, ...node.children.flatMap(subtreeIds)];
}
