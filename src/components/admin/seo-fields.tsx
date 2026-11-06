"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fill } from "@/lib/fill";
import { cn } from "@/lib/utils";

export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 160;

type Props = {
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  /** Hard limits (the stored column sizes); the counters show the softer search-result lengths. */
  maxLength?: { title: number; description: number };
  /** Translated error per field, if any. */
  errors?: { title?: string; description?: string };
  labels: {
    title: string;
    description: string;
    /** Template with `{count}` and `{max}`. */
    count: string;
    tooLong: string;
  };
};

function Counter({ id, count, max, labels }: { id: string; count: number; max: number; labels: Props["labels"] }) {
  const over = count > max;
  return (
    <p id={id} className={cn("text-small", over ? "text-warning" : "text-muted-foreground")}>
      {fill(labels.count, { count, max })}
      {over && <> · {labels.tooLong}</>}
    </p>
  );
}

/** SEO title and description with the lengths search results usually show (a hint, not a limit). */
export function SeoFields({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  maxLength,
  errors,
  labels,
}: Props) {
  const id = useId();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-title`}>{labels.title}</Label>
        <Input
          id={`${id}-title`}
          value={title}
          maxLength={maxLength?.title}
          onChange={(event) => onTitleChange(event.target.value)}
          aria-invalid={Boolean(errors?.title)}
          aria-describedby={`${id}-title-count ${id}-title-error`}
        />
        <Counter id={`${id}-title-count`} count={title.length} max={SEO_TITLE_MAX} labels={labels} />
        <p id={`${id}-title-error`} aria-live="polite" className="text-small font-medium text-destructive empty:-mt-2">
          {errors?.title}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-description`}>{labels.description}</Label>
        <Textarea
          id={`${id}-description`}
          rows={3}
          value={description}
          maxLength={maxLength?.description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          aria-invalid={Boolean(errors?.description)}
          aria-describedby={`${id}-description-count ${id}-description-error`}
        />
        <Counter
          id={`${id}-description-count`}
          count={description.length}
          max={SEO_DESCRIPTION_MAX}
          labels={labels}
        />
        <p
          id={`${id}-description-error`}
          aria-live="polite"
          className="text-small font-medium text-destructive empty:-mt-2"
        >
          {errors?.description}
        </p>
      </div>
    </div>
  );
}
