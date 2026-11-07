"use client";

import { useActionState } from "react";

import { LocaleLink } from "@/components/layout/locale-link";
import { buttonVariants } from "@/components/ui/button-variants";
import { type UnsubscribeState, unsubscribeNewsletter } from "@/modules/content/public/newsletter.actions";

export type UnsubscribeLabels = {
  title: string;
  text: string;
  button: string;
  doneTitle: string;
  doneText: string;
  alreadyTitle: string;
  alreadyText: string;
  invalidTitle: string;
  invalidText: string;
  unavailable: string;
  backHome: string;
};

/**
 * The unsubscribe button (Phase 6 step 10a). Unsubscribing takes a press, so mail systems that
 * open links cannot unsubscribe the reader; withdrawing is still one click from the email.
 */
export function UnsubscribeNewsletterForm({ token, labels }: { token: string | null; labels: UnsubscribeLabels }) {
  const [state, action, pending] = useActionState<UnsubscribeState, FormData>(unsubscribeNewsletter, {
    status: token ? "idle" : "invalid",
  });

  const [heading, text] =
    state.status === "unsubscribed"
      ? [labels.doneTitle, labels.doneText]
      : state.status === "already"
        ? [labels.alreadyTitle, labels.alreadyText]
        : state.status === "invalid"
          ? [labels.invalidTitle, labels.invalidText]
          : [labels.title, state.status === "unavailable" ? labels.unavailable : labels.text];
  const open = token && (state.status === "idle" || state.status === "unavailable");

  return (
    <div className="flex flex-col items-start gap-6" aria-live="polite" data-testid="newsletter-unsubscribe" data-status={state.status}>
      <h1 className="text-balance font-serif text-h1 font-medium md:text-h1-lg">{heading}</h1>
      <p className="max-w-prose text-body-lg text-muted-foreground">{text}</p>
      {open ? (
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
