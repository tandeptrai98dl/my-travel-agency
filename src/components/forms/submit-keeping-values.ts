import { type FormEvent, startTransition } from "react";

/**
 * Sends the form through `dispatch` (the `useActionState` action) in a transition. React resets a
 * form once its `action` prop completes, which would empty every field when the server answers
 * with an error; dispatching here keeps what the visitor typed. Without JavaScript the form's own
 * `action` still posts. Call it after anything that may hold the submit back (Turnstile).
 */
export function submitKeepingValues(event: FormEvent<HTMLFormElement>, dispatch: (data: FormData) => void) {
  if (event.defaultPrevented) return;
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  // React's own hidden fields for the no-JavaScript post.
  for (const key of [...data.keys()]) if (key.startsWith("$ACTION")) data.delete(key);
  startTransition(() => dispatch(data));
}
