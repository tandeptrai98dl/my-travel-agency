"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { fill } from "@/lib/fill";

/** Plain strings (usable from Server Components); templates use `{index}`, `{from}`, `{to}`. */
export type ListEditorLabels = {
  add: string;
  item: string;
  remove: string;
  moveUp: string;
  moveDown: string;
  /** Announced after a move: "Moved line {from} to {to}". */
  moved: string;
  /** Announced after a removal: "Removed line {index}". */
  removed: string;
};

type Props = {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  labels: ListEditorLabels;
  max?: number;
};

/**
 * Ordered list of short texts (highlights, inclusions). Rows keep stable keys, so focus follows
 * a moved row; moves and removals are announced; buttons never submit the surrounding form.
 * Controlled: the parent must apply every `onChange` (keys are reordered with the values).
 */
export function ListEditor({ label, value, onChange, labels, max = 30 }: Props) {
  const id = useId();
  // Keys are per component (the same on server and browser for the first render); DOM ids use
  // them only through React's useId prefix.
  const counter = useRef(value.length);
  const newKey = () => `item-${counter.current++}`;
  const [keys, setKeys] = useState<string[]>(() => value.map((_, i) => `item-${i}`));
  const [announcement, setAnnouncement] = useState("");
  const focusTarget = useRef<{ key: string; control: "input" | "up" | "down" } | "add" | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const addRef = useRef<HTMLButtonElement>(null);

  // Keep keys in step when the parent replaces the list (form reset).
  useEffect(() => {
    setKeys((current) =>
      current.length === value.length ? current : value.map((_, i) => current[i] ?? `item-${counter.current++}`),
    );
  }, [value]);

  useEffect(() => {
    const target = focusTarget.current;
    focusTarget.current = null;
    if (!target) return;
    if (target === "add") {
      addRef.current?.focus();
      return;
    }
    const row = rowRefs.current.get(target.key);
    // The same button if it is still enabled (moved to the top or bottom: the other direction).
    const other = target.control === "up" ? "down" : "up";
    const element =
      target.control === "input"
        ? row?.querySelector<HTMLElement>("input")
        : (row?.querySelector<HTMLElement>(`[data-control="${target.control}"]:not(:disabled)`) ??
          row?.querySelector<HTMLElement>(`[data-control="${other}"]:not(:disabled)`) ??
          row?.querySelector<HTMLElement>("input"));
    element?.focus();
  });

  const move = (from: number, to: number, control: "up" | "down") => {
    const nextValue = [...value];
    const nextKeys = [...keys];
    const [item] = nextValue.splice(from, 1);
    const [key] = nextKeys.splice(from, 1);
    nextValue.splice(to, 0, item);
    nextKeys.splice(to, 0, key);
    setKeys(nextKeys);
    focusTarget.current = { key, control };
    setAnnouncement(fill(labels.moved, { from: from + 1, to: to + 1 }));
    onChange(nextValue);
  };

  const remove = (index: number) => {
    const nextKeys = keys.filter((_, i) => i !== index);
    setKeys(nextKeys);
    const neighbour = nextKeys[index] ?? nextKeys[index - 1];
    focusTarget.current = neighbour ? { key: neighbour, control: "input" } : "add";
    setAnnouncement(fill(labels.removed, { index: index + 1 }));
    onChange(value.filter((_, i) => i !== index));
  };

  const add = () => {
    const key = newKey();
    setKeys([...keys, key]);
    focusTarget.current = { key, control: "input" };
    onChange([...value, ""]);
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-small font-medium">{label}</legend>
      <ol className="flex flex-col gap-2">
        {value.map((item, index) => {
          const n = index + 1;
          const key = keys[index] ?? `pending-${index}`;
          return (
            <li
              key={key}
              ref={(element) => {
                if (element) rowRefs.current.set(key, element);
                else rowRefs.current.delete(key);
              }}
              className="flex items-center gap-2"
            >
              <label htmlFor={`${id}-${key}`} className="sr-only">
                {fill(labels.item, { index: n })}
              </label>
              <span aria-hidden="true" className="w-6 text-right text-small text-muted-foreground tabular-nums">
                {n}.
              </span>
              <Input
                id={`${id}-${key}`}
                value={item}
                onChange={(event) => onChange(value.map((v, i) => (i === index ? event.target.value : v)))}
              />
              <IconButton
                size="sm"
                data-control="up"
                label={fill(labels.moveUp, { index: n })}
                icon={<ArrowUp strokeWidth={1.5} />}
                disabled={index === 0}
                onClick={() => move(index, index - 1, "up")}
              />
              <IconButton
                size="sm"
                data-control="down"
                label={fill(labels.moveDown, { index: n })}
                icon={<ArrowDown strokeWidth={1.5} />}
                disabled={index === value.length - 1}
                onClick={() => move(index, index + 1, "down")}
              />
              <IconButton
                size="sm"
                label={fill(labels.remove, { index: n })}
                icon={<Trash2 strokeWidth={1.5} />}
                onClick={() => remove(index)}
              />
            </li>
          );
        })}
      </ol>
      <div>
        <Button ref={addRef} type="button" variant="outline" size="sm" disabled={value.length >= max} onClick={add}>
          <Plus strokeWidth={1.5} aria-hidden="true" />
          {labels.add}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </fieldset>
  );
}
