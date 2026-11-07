"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { useSubmitWithoutReset } from "@/components/forms/use-submit-without-reset";
import { buttonVariants } from "@/components/ui/button-variants";
import { cx } from "@/lib/cx";
import { type AccountFormState, saveTravellersAction } from "@/modules/account/account.actions";

type Traveller = { fullName: string; dateOfBirth: string; nationality: string; dietaryNotes: string; isLead: boolean };

export type TravellersFormLabels = {
  row: string;
  fullName: string;
  dateOfBirth: string;
  nationality: string;
  dietaryNotes: string;
  lead: string;
  leadLegend: string;
  add: string;
  remove: string;
  save: string;
  saving: string;
  status: Record<string, string> & { failed: string };
  errors: Record<string, string> & { invalid: string };
};

type Props = {
  code: string;
  max: number;
  initial: Traveller[];
  labels: TravellersFormLabels;
};

const fieldClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-card px-3.5 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[invalid=true]:border-destructive";

let nextKey = 0;
const blank = (): Traveller & { key: number } => ({ key: nextKey++, fullName: "", dateOfBirth: "", nationality: "", dietaryNotes: "", isLead: false });

/**
 * Travellers of one booking (docs/specs/phase-5-accounts-inquiries-operations.md decision 4): name,
 * date of birth, nationality and dietary notes, never a passport number; at most the booking's
 * party; one lead traveller. Saved through `save_customer_travellers()`, which checks the same.
 */
export function TravellersForm({ code, max, initial, labels }: Props) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(saveTravellersAction, { status: "idle" });
  const onSubmit = useSubmitWithoutReset(action);
  const [rows, setRows] = useState(() => (initial.length > 0 ? initial.map((t) => ({ ...t, key: nextKey++ })) : [{ ...blank(), isLead: true }]));
  const [lead, setLead] = useState(() => Math.max(rows.findIndex((row) => row.isLead), 0));
  const statusRef = useRef<HTMLParagraphElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.status === "idle") return;
    const firstError = Object.keys(errors)[0];
    if (firstError) document.getElementById(`${baseId}-${firstError}`)?.focus();
    else statusRef.current?.focus();
    // errors come with state; the id is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const remove = (index: number) => {
    setRows((current) => current.filter((_, i) => i !== index));
    setLead((current) => (index === current ? 0 : index < current ? current - 1 : current));
    // The add button may only appear after the re-render.
    requestAnimationFrame(() => addRef.current?.focus());
  };

  const field = (index: number, name: keyof Omit<Traveller, "isLead">, label: string, type: "text" | "date", extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => {
    const id = `${baseId}-${index}.${name}`;
    const error = errors[`${index}.${name}`];
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-small font-medium">
          {label}
        </label>
        <input
          id={id}
          name={name}
          type={type}
          defaultValue={rows[index][name]}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={fieldClass}
          {...extra}
        />
        {error ? (
          <p id={`${id}-error`} className="text-small text-destructive">
            {labels.errors[error] ?? labels.errors.invalid}
          </p>
        ) : null}
      </div>
    );
  };

  const statusText = state.status === "idle" ? "" : (labels.status[state.status] ?? labels.status.failed);

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-6" data-testid="travellers-form">
      <input type="hidden" name="code" value={code} />
      <fieldset className="flex flex-col gap-6">
        <legend className="sr-only">{labels.leadLegend}</legend>
        {rows.map((row, index) => (
          <fieldset key={row.key} className="flex flex-col gap-4 rounded-lg border border-border p-5">
            <legend className="px-1 text-small font-semibold">{labels.row.replace("{number}", String(index + 1))}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {field(index, "fullName", labels.fullName, "text", { autoComplete: "off", maxLength: 120 })}
              {field(index, "dateOfBirth", labels.dateOfBirth, "date")}
              {field(index, "nationality", labels.nationality, "text", { maxLength: 60 })}
              {field(index, "dietaryNotes", labels.dietaryNotes, "text", { maxLength: 500 })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex min-h-11 items-center gap-2 text-small">
                <input type="radio" name="lead" value={index} checked={lead === index} onChange={() => setLead(index)} className="h-5 w-5 accent-[hsl(var(--primary))]" />
                {labels.lead}
              </label>
              {rows.length > 1 ? (
                <button type="button" onClick={() => remove(index)} className={buttonVariants({ variant: "link" })}>
                  {labels.remove.replace("{number}", String(index + 1))}
                </button>
              ) : null}
            </div>
          </fieldset>
        ))}
      </fieldset>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {rows.length < max ? (
          <button ref={addRef} type="button" onClick={() => setRows((current) => [...current, blank()])} className={buttonVariants({ variant: "secondary" })}>
            {labels.add}
          </button>
        ) : null}
        <button type="submit" disabled={pending} className={cx(buttonVariants({ size: "lg" }))}>
          {pending ? labels.saving : labels.save}
        </button>
      </div>
      <p ref={statusRef} tabIndex={-1} role="status" className={cx("text-body focus:outline-none", state.status === "saved" ? "text-foreground" : "text-destructive", statusText ? "" : "sr-only")}>
        {statusText}
      </p>
    </form>
  );
}
