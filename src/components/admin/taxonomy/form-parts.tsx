"use client";

import { AlertTriangle, ImageIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import { type MediaPickerLabels, MediaPicker } from "@/components/admin/media/media-picker";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/modules/catalog/taxonomy/taxonomy.actions";

/** Zod messages and server error codes are keys in `Admin.Taxonomy.errors`. */
export function useErrorText() {
  const t = useTranslations("Admin.Taxonomy.errors");
  return (key: string) => (t.has(key) ? t(key) : t("invalid"));
}

/**
 * Puts a failed action's field errors on the form and returns the text for the form-level alert:
 * "fix the marked fields" when there are field errors, otherwise the error itself.
 */
export function useActionErrors() {
  const t = useTranslations("Admin.Taxonomy");
  const errorText = useErrorText();
  return <T extends FieldValues>(
    form: UseFormReturn<T, unknown, unknown>,
    result: Extract<ActionResult, { ok: false }>,
  ): string => {
    const fields = { ...result.fields };
    if (result.field) fields[result.field] = result.error;
    const names = Object.keys(fields);
    for (const name of names) form.setError(name as Path<T>, { type: "server", message: fields[name] });
    return names.length > 0 ? t("fixErrors") : errorText(result.error);
  };
}

/** Dotted paths of every error in a React Hook Form errors object, in field order. */
export function errorPaths(errors: object, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(errors)) {
    // `ref` holds the field's DOM element, not nested errors.
    if (key === "ref" || !value || typeof value !== "object") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if ("message" in value && typeof (value as { message?: unknown }).message === "string") out.push(path);
    else out.push(...errorPaths(value, path));
  }
  return out;
}

/**
 * The language tab to open so the first error can be seen and focused: only when every error is
 * inside one language's fields (fields outside the tabs come first on the page).
 */
export function tabForErrors(paths: string[]): "vi" | "en" | null {
  if (paths.length === 0 || !paths.every((path) => path.startsWith("translations."))) return null;
  return paths[0].startsWith("translations.en") ? "en" : "vi";
}

export type HeroSummary = { id: string; url: string; alt: string; altComplete: boolean } | null;

/** Hero image chosen from the media library; publishing needs both alt texts (decision 6). */
export function HeroField({
  id,
  value,
  onChange,
  initial,
  pickerLabels,
  error,
}: {
  id: string;
  value: string | null;
  onChange: (id: string | null) => void;
  initial: HeroSummary;
  pickerLabels: MediaPickerLabels;
  error?: string;
}) {
  const t = useTranslations("Admin.Taxonomy");
  const [hero, setHero] = useState<HeroSummary>(initial);
  const current = value && hero?.id === value ? hero : null;
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={`${id}-error`}>
      <legend className="text-small font-medium">{t("hero")}</legend>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-36 items-center justify-center overflow-hidden bg-secondary">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview
            <img src={current.url} alt={current.alt} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          {!current && <p className="text-small text-muted-foreground">{t("noHero")}</p>}
          {current && !current.altComplete && (
            <p className="flex items-center gap-2 text-small text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              {t("heroAltMissing")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <MediaPicker
              labels={pickerLabels}
              trigger={
                <Button type="button" variant="outline" size="sm">
                  {current ? t("changeHero") : t("chooseHero")}
                </Button>
              }
              onSelect={([item]) => {
                if (!item) return;
                setHero({
                  id: item.id,
                  url: item.url,
                  alt: item.alt.vi || item.alt.en,
                  altComplete: item.altComplete,
                });
                onChange(item.id);
              }}
            />
            {current && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
                <X strokeWidth={1.5} aria-hidden="true" />
                {t("removeHero")}
              </Button>
            )}
          </div>
        </div>
      </div>
      <p id={`${id}-error`} aria-live="polite" className="text-small font-medium text-destructive empty:-mt-3">
        {error}
      </p>
    </fieldset>
  );
}

/** Which language tabs hold errors, for LocaleTabs' "missing" state. */
export function localeErrorState(
  errors: { translations?: Partial<Record<"vi" | "en", unknown>> },
  published: Record<"vi" | "en", boolean>,
) {
  return {
    vi: { published: published.vi, missing: Boolean(errors.translations?.vi) },
    en: { published: published.en, missing: Boolean(errors.translations?.en) },
  };
}
