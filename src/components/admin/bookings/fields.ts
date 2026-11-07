export const selectClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-small text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

/** Puts server field errors back on the form, or returns the alert key when there are none. */
export function applyServerErrors(
  result: { error: string; fields?: Record<string, string> },
  setError: (name: string, message: string) => void,
): string | null {
  const fields = Object.entries(result.fields ?? {});
  for (const [name, message] of fields) setError(name, message);
  return fields.length === 0 ? result.error : null;
}
