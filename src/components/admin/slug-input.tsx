"use client";

import { Wand2 } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidSlug, slugify } from "@/lib/slug";

type Props = {
  value: string;
  onChange: (slug: string) => void;
  /** The title to generate from. */
  source: string;
  /** Path shown before the slug, e.g. "/en/tours/". */
  prefix?: string;
  error?: string;
  labels: { label: string; hint: string; generate: string; invalid: string };
};

/** URL slug with "generate from title" (diacritics removed, docs/specs/phase-2 decision 4). */
export function SlugInput({ value, onChange, source, prefix, error, labels }: Props) {
  const id = useId();
  const invalid = value !== "" && !isValidSlug(value);
  const message = error ?? (invalid ? labels.invalid : undefined);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{labels.label}</Label>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          {prefix && <span className="shrink-0 pl-3 text-small text-muted-foreground">{prefix}</span>}
          <Input
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
            spellCheck={false}
            autoCapitalize="off"
            aria-invalid={Boolean(message)}
            aria-describedby={`${id}-hint${message ? ` ${id}-error` : ""}`}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <Button type="button" variant="outline" onClick={() => onChange(slugify(source))} disabled={!source.trim()}>
          <Wand2 strokeWidth={1.5} aria-hidden="true" />
          {labels.generate}
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-small text-muted-foreground">
        {labels.hint}
      </p>
      {message && (
        <p id={`${id}-error`} className="text-small font-medium text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
