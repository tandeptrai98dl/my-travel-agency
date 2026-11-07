"use client";

import { useState } from "react";

/** Folds case and Vietnamese diacritics (đ included) for matching. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
}

/**
 * Narrows the destination list as the visitor types (shown when there are more than ten). It
 * hides rows only; a hidden row keeps its choice. Ancestors of a match stay visible.
 */
export function DestinationFilterSearch({ listId, label }: { listId: string; label: string }) {
  const [value, setValue] = useState("");

  const filter = (text: string) => {
    setValue(text);
    const list = document.getElementById(listId);
    if (!list) return;
    const term = fold(text);
    const rows = [...list.querySelectorAll<HTMLLIElement>("li")];
    const matches = new Set<HTMLLIElement>();
    for (const row of rows) {
      const name = fold(row.dataset.name ?? "");
      if (!term || name.includes(term)) {
        let node: HTMLElement | null = row;
        while (node && node !== list) {
          if (node instanceof HTMLLIElement) matches.add(node);
          node = node.parentElement;
        }
      }
    }
    for (const row of rows) row.hidden = !matches.has(row);
  };

  return (
    <input
      type="search"
      // Not a search parameter: no name, so it never reaches the URL.
      aria-label={label}
      aria-controls={listId}
      placeholder={label}
      value={value}
      onChange={(event) => filter(event.target.value)}
      className="mb-3 h-10 w-full rounded-md border border-input bg-card px-3 text-small text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}
