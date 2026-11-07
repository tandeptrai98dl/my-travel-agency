"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { useSubmitWithoutReset } from "@/components/forms/use-submit-without-reset";
import { useTurnstile } from "@/components/forms/use-turnstile";
import { buttonVariants } from "@/components/ui/button-variants";
import { cx } from "@/lib/cx";
import type { AuthField, AuthState, AuthStatus } from "@/modules/identity/customer-auth.schemas";

export type AuthFieldSpec = {
  name: AuthField | "marketing";
  type: "text" | "email" | "password" | "checkbox";
  label: string;
  autoComplete?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  /** A link inside a checkbox label (the privacy policy). */
  link?: { href: string; label: string; newTab: string };
};

export type AuthFormLabels = {
  submit: string;
  pending: string;
  /** Answers by status (`sent`, `invalid_credentials`, …); unknown ones use `failed`. */
  status: Partial<Record<AuthStatus, string>> & { failed: string };
  /** Field errors by key (`invalidEmail`, `passwordTooShort`, …); unknown ones use `invalid`. */
  errors: Record<string, string> & { invalid: string };
  /** Shown instead of the form while it cannot work (missing policy or services). */
  unavailable?: string;
};

type Props = {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  fields: AuthFieldSpec[];
  hidden?: Record<string, string>;
  labels: AuthFormLabels;
  locale: "vi" | "en";
  /** Turnstile, when the form needs it (decision 2). Null: not required here, or not configured. */
  turnstile?: { siteKey: string | null; action: string } | null;
  disabled?: boolean;
  /** Statuses after which the form is replaced by its answer (the "check your email" message). */
  doneOn?: AuthStatus[];
  /** Clears the password fields after these statuses (a saved change). */
  resetOn?: AuthStatus[];
  testId?: string;
};

const fieldClass =
  "h-12 w-full min-w-0 rounded-md border border-input bg-card px-3.5 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive";

/**
 * One form for every auth and account step (docs/specs/phase-5-accounts-inquiries-operations.md
 * PR 5A step 3): posts to a Server Action, shows field errors linked to their fields, announces
 * the answer in a status line and moves focus to it (or to the first invalid field). Turnstile
 * loads on the first interaction when the form needs it.
 */
export function AuthForm({ action, fields, hidden = {}, labels, locale, turnstile = null, disabled = false, doneOn = ["sent"], resetOn = [], testId }: Props) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const challenge = useTurnstile({ siteKey: turnstile?.siteKey ?? null, locale, action: turnstile?.action ?? "auth", formRef });
  const { reset } = challenge;
  const onSubmit = useSubmitWithoutReset(formAction, turnstile ? challenge.onSubmit : undefined);
  const baseId = useId();
  const id = (name: string) => `${baseId}-${name}`;
  const errors = state.errors ?? {};
  const done = doneOn.includes(state.status);

  useEffect(() => {
    if (state.status === "idle") return;
    reset();
    if (resetOn.includes(state.status)) {
      formRef.current?.querySelectorAll<HTMLInputElement>("input[type=password]").forEach((input) => (input.value = ""));
    }
    const first = fields.find((field) => errors[field.name as AuthField]);
    if (first) document.getElementById(id(first.name))?.focus();
    else statusRef.current?.focus();
    // `fields`, `resetOn` and the ids are stable for a form; errors come with state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const statusText =
    state.status === "idle" ? (disabled ? (labels.unavailable ?? "") : "") : state.status === "invalid" && Object.keys(errors).length > 0 ? "" : (labels.status[state.status] ?? labels.status.failed);
  const positive = ["sent", "saved", "deleted", "deletion_pending", "received"].includes(state.status);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      data-testid={testId}
      onFocus={turnstile ? challenge.start : undefined}
      onPointerDown={turnstile ? challenge.start : undefined}
      onSubmit={onSubmit}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="locale" value={locale} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {!done ? (
        <fieldset disabled={disabled || pending} className="flex flex-col gap-5">
          {fields.map((field) => {
            const error = errors[field.name as AuthField];
            const errorId = error ? `${id(field.name)}-error` : undefined;
            const hintId = field.hint ? `${id(field.name)}-hint` : undefined;
            const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
            const message = error ? (
              <p id={errorId} className="text-small text-destructive">
                {labels.errors[error] ?? labels.errors.invalid}
              </p>
            ) : null;
            if (field.type === "checkbox") {
              return (
                <div key={field.name} className="flex flex-col gap-1.5">
                  <label htmlFor={id(field.name)} className="flex items-start gap-3 text-small">
                    <input
                      id={id(field.name)}
                      name={field.name}
                      type="checkbox"
                      required={field.required}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={describedBy}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                    />
                    <span>
                      {field.label}
                      {field.link ? (
                        <>
                          {" "}
                          <a href={field.link.href} className="underline decoration-gold underline-offset-4" target="_blank" rel="noopener">
                            {field.link.label}
                            <span className="sr-only"> {field.link.newTab}</span>
                          </a>
                        </>
                      ) : null}
                    </span>
                  </label>
                  {message}
                </div>
              );
            }
            return (
              <div key={field.name} className="flex flex-col gap-1.5">
                <label htmlFor={id(field.name)} className="text-small font-medium">
                  {field.label}
                </label>
                <input
                  id={id(field.name)}
                  name={field.name}
                  type={field.type}
                  required={field.required}
                  autoComplete={field.autoComplete}
                  defaultValue={field.defaultValue}
                  inputMode={field.type === "email" ? "email" : undefined}
                  maxLength={field.type === "password" ? 200 : 254}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy}
                  className={fieldClass}
                />
                {field.hint ? (
                  <p id={hintId} className="text-small text-muted-foreground">
                    {field.hint}
                  </p>
                ) : null}
                {message}
              </div>
            );
          })}
          {turnstile ? <div ref={challenge.widgetRef} /> : null}
          <button type="submit" className={cx(buttonVariants({ size: "lg" }), "w-full sm:w-auto sm:self-start")}>
            {pending || challenge.waiting ? labels.pending : labels.submit}
          </button>
        </fieldset>
      ) : null}
      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        className={cx("text-body focus:outline-none", positive ? "text-foreground" : "text-destructive", statusText ? "" : "sr-only")}
      >
        {statusText}
      </p>
    </form>
  );
}
