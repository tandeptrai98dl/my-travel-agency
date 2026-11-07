"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cx } from "@/lib/cx";
import { type AccountFormState, saveMarketingAction, saveProfileAction } from "@/modules/account/account.actions";

const fieldClass =
  "h-12 w-full min-w-0 rounded-md border border-input bg-card px-3.5 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[invalid=true]:border-destructive";

type Messages = { status: Record<string, string> & { failed: string }; errors: Record<string, string> & { invalid: string } };

function useAnswer(state: AccountFormState, baseId: string) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "idle") return;
    const first = Object.keys(state.errors ?? {})[0];
    if (first) document.getElementById(`${baseId}-${first}`)?.focus();
    else statusRef.current?.focus();
  }, [state, baseId]);
  return statusRef;
}

function Status({ state, messages, statusRef }: { state: AccountFormState; messages: Messages; statusRef: React.RefObject<HTMLParagraphElement | null> }) {
  const text = state.status === "idle" ? "" : (messages.status[state.status] ?? messages.status.failed);
  return (
    <p ref={statusRef} tabIndex={-1} role="status" className={cx("text-body focus:outline-none", state.status === "saved" ? "text-foreground" : "text-destructive", text ? "" : "sr-only")}>
      {text}
    </p>
  );
}

export type ProfileFormLabels = Messages & {
  fullName: string;
  phone: string;
  country: string;
  language: string;
  languages: { vi: string; en: string };
  save: string;
  saving: string;
};

/** Name, phone, country and email language (decision 4), through the profile column grants. */
export function ProfileForm({ initial, labels }: { initial: { fullName: string; phone: string; country: string; locale: "vi" | "en" }; labels: ProfileFormLabels }) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(saveProfileAction, { status: "idle" });
  const baseId = useId();
  const statusRef = useAnswer(state, baseId);
  const errors = state.errors ?? {};
  const input = (name: "fullName" | "phone" | "country", type: string, autoComplete: string, maxLength: number) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${baseId}-${name}`} className="text-small font-medium">
        {labels[name]}
      </label>
      <input
        id={`${baseId}-${name}`}
        name={name}
        type={type}
        autoComplete={autoComplete}
        maxLength={maxLength}
        defaultValue={initial[name]}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${baseId}-${name}-error` : undefined}
        className={fieldClass}
      />
      {errors[name] ? (
        <p id={`${baseId}-${name}-error`} className="text-small text-destructive">
          {labels.errors[errors[name]] ?? labels.errors.invalid}
        </p>
      ) : null}
    </div>
  );
  return (
    <form action={action} noValidate className="flex flex-col gap-5" data-testid="profile-form">
      <div className="grid gap-5 sm:grid-cols-2">
        {input("fullName", "text", "name", 120)}
        {input("phone", "tel", "tel", 30)}
        {input("country", "text", "country-name", 60)}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${baseId}-locale`} className="text-small font-medium">
            {labels.language}
          </label>
          <select id={`${baseId}-locale`} name="preferredLocale" defaultValue={initial.locale} className={fieldClass}>
            <option value="vi" lang="vi">
              {labels.languages.vi}
            </option>
            <option value="en" lang="en">
              {labels.languages.en}
            </option>
          </select>
        </div>
      </div>
      <button type="submit" disabled={pending} className={buttonVariants({ size: "lg", className: "self-start" })}>
        {pending ? labels.saving : labels.save}
      </button>
      <Status state={state} messages={labels} statusRef={statusRef} />
    </form>
  );
}

export type MarketingFormLabels = Messages & { marketing: string; save: string; saving: string };

/** The marketing choice: saved with its consent row (`set_marketing_consent()`). */
export function MarketingForm({ locale, initial, labels }: { locale: "vi" | "en"; initial: boolean; labels: MarketingFormLabels }) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(saveMarketingAction, { status: "idle" });
  const baseId = useId();
  const statusRef = useAnswer(state, baseId);
  return (
    <form action={action} className="flex flex-col gap-4" data-testid="marketing-form">
      <input type="hidden" name="locale" value={locale} />
      <label className="flex items-start gap-3 text-body">
        <input name="marketing" type="checkbox" defaultChecked={initial} className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" />
        <span>{labels.marketing}</span>
      </label>
      <button type="submit" disabled={pending} className={buttonVariants({ variant: "secondary", className: "self-start" })}>
        {pending ? labels.saving : labels.save}
      </button>
      <Status state={state} messages={labels} statusRef={statusRef} />
    </form>
  );
}
