"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";

type Props = {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  labels: {
    add: string;
    item: (index: number) => string;
    remove: (index: number) => string;
    moveUp: (index: number) => string;
    moveDown: (index: number) => string;
  };
  max?: number;
};

/** Ordered list of short texts (highlights, inclusions); keyboard reordering with buttons. */
export function ListEditor({ label, value, onChange, labels, max = 30 }: Props) {
  const id = useId();
  const move = (from: number, to: number) => {
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-small font-medium">{label}</legend>
      <ol className="flex flex-col gap-2">
        {value.map((item, index) => {
          const n = index + 1;
          return (
            <li key={index} className="flex items-center gap-2">
              <label htmlFor={`${id}-${index}`} className="sr-only">
                {labels.item(n)}
              </label>
              <span aria-hidden="true" className="w-6 text-right text-small text-muted-foreground tabular-nums">
                {n}.
              </span>
              <Input
                id={`${id}-${index}`}
                value={item}
                onChange={(event) => onChange(value.map((v, i) => (i === index ? event.target.value : v)))}
              />
              <IconButton
                size="sm"
                label={labels.moveUp(n)}
                icon={<ArrowUp strokeWidth={1.5} />}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              />
              <IconButton
                size="sm"
                label={labels.moveDown(n)}
                icon={<ArrowDown strokeWidth={1.5} />}
                disabled={index === value.length - 1}
                onClick={() => move(index, index + 1)}
              />
              <IconButton
                size="sm"
                label={labels.remove(n)}
                icon={<Trash2 strokeWidth={1.5} />}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              />
            </li>
          );
        })}
      </ol>
      <div>
        <Button type="button" variant="outline" size="sm" disabled={value.length >= max} onClick={() => onChange([...value, ""])}>
          <Plus strokeWidth={1.5} aria-hidden="true" />
          {labels.add}
        </Button>
      </div>
    </fieldset>
  );
}
