"use client";

import { type FormEvent, useCallback, useTransition } from "react";

/**
 * Submits a form to its `useActionState` action without React 19's automatic form reset, which
 * otherwise clears every uncontrolled field after the action returns, so a visitor who gets a
 * field error would have to type everything again. The form keeps `action={...}` for submits
 * without JavaScript; with JavaScript this handler takes over. `before` runs first and may cancel
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
      startTransition(() => dispatch(data));
    },
    [dispatch, before],
  );
}
