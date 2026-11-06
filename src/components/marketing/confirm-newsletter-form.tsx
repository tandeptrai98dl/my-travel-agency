"use client";

import { useActionState } from "react";

import { LocaleLink } from "@/components/layout/locale-link";
import { buttonVariants } from "@/components/ui/button-variants";
import { type ConfirmState, confirmNewsletter } from "@/modules/content/public/newsletter.actions";

type Labels = {
  title: string;
  text: string;
  button: string;
  confirmedTitle: string;
  confirmedText: string;
  invalidTitle: string;
  invalidText: string;
  unavailable: string;
  backHome: string;
};

/**
 * The confirmation button (double opt-in step 2). Confirming takes a click, so link scanners in
 * mail systems cannot confirm on the reader's behalf.
 */
export function ConfirmNewsletterForm({ token, labels }: { token: string | null; labels: Labels }) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmNewsletter, {
    status: token ? "idle" : "invalid",
  });

  const heading =
    state.status === "confirmed" ? labels.confirmedTitle : state.status === "invalid" ? labels.invalidTitle : labels.title;
  const text =
    state.status === "confirmed"
      ? labels.confirmedText
      : state.status === "invalid"
        ? labels.invalidText
        : state.status === "unavailable"
          ? labels.unavailable
          : labels.text;

  return (
    <div className="flex flex-col items-start gap-6" aria-live="polite">
      <h1 className="text-balance font-serif text-h1 font-medium md:text-h1-lg">{heading}</h1>
      <p className="max-w-prose text-body-lg text-muted-foreground">{text}</p>
      {token && state.status !== "confirmed" && state.status !== "invalid" ? (
        <form action={action}>
          <input type="hidden" name="token" value={token} />
          <button type="submit" disabled={pending} className={buttonVariants({ size: "lg" })}>
            {labels.button}
          </button>
        </form>
      ) : (
        <LocaleLink href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
          {labels.backHome}
        </LocaleLink>
      )}
    </div>
  );
}
