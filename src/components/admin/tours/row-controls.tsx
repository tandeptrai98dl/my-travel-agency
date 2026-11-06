"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";

import { IconButton } from "@/components/ui/icon-button";

/** Move up / move down / remove for one row of an ordered list (itinerary days, FAQs, gallery). */
export function RowControls({
  index,
  count,
  labels,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  labels: { up: string; down: string; remove: string };
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <IconButton
        size="sm"
        label={labels.up}
        icon={<ArrowUp strokeWidth={1.5} />}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      />
      <IconButton
        size="sm"
        label={labels.down}
        icon={<ArrowDown strokeWidth={1.5} />}
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      />
      <IconButton
        size="sm"
        label={labels.remove}
        icon={<Trash2 strokeWidth={1.5} />}
        onClick={() => onRemove(index)}
      />
    </div>
  );
}

/** A polite live region for "moved" / "removed" messages, and a setter for them. */
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const region = (
    <p aria-live="polite" className="sr-only">
      {message}
    </p>
  );
  return { announce: setMessage, region };
}

/**
 * After a move the row keeps its React key, so focus stays on the button that was pressed; when
 * that button becomes disabled (top or bottom), focus moves to the row's other arrow.
 */
export function focusAfterMove(container: HTMLElement | null, rowIndex: number) {
  requestAnimationFrame(() => {
    const row = container?.querySelectorAll<HTMLElement>("[data-row]")[rowIndex];
    if (!row || row.contains(document.activeElement) && !(document.activeElement as HTMLButtonElement)?.disabled) return;
    row.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  });
}
