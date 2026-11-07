"use client";

import { type FormEvent, useCallback, useTransition } from "react";

/**
 * Submits a form to its `useActionState` action without React 19's automatic form reset, which
 * otherwise clears every uncontrolled field after the action returns, so a visitor who gets a
 * field error would have to type everything again. The form keeps `action={...}` for submits
 * without JavaScript; with JavaScript this handler takes over, keeping the submitter's name and value.
 * Every public, auth and account form uses it. `before` runs first and may cancel
 * the submit (`event.preventDefault()`), as Turnstile does while it waits for its token.
 */
export function useSubmitWithoutReset(dispatch: (formData: FormData) => void, before?: (event: FormEvent<HTMLFormElement>) => void) {
  const [, startTransition] = useTransition();
  return useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      before?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      const data = new FormData(event.currentTarget, submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
      // React's own hidden fields for the no-JavaScript post (`$ACTION_…`) are not form data.
      for (const key of [...data.keys()]) if (key.startsWith("$ACTION")) data.delete(key);
      startTransition(() => dispatch(data));
    },
    [dispatch, before],
  );
}
