/**
 * The tailor-made wizard's browser draft (Phase 5 PR 5W). Its own chunk, loaded after the wizard
 * mounts: the draft is not needed to show or use the form, and the wizard page stays inside the
 * initial-JS budget (Phase 3 spec decision 16).
 */

const DRAFT_KEY = "pta:tailor-made:draft:v1";
/** Never kept in the draft: consent is given at submit time; tokens and the honeypot are per request. */
const NOT_DRAFTED = new Set(["consent", "cf-turnstile-response", "website", "source", "locale"]);
/** React's hidden fields for the no-JavaScript post (`$ACTION_…`) belong to this render only. */
const skipped = (name: string) => NOT_DRAFTED.has(name) || name.startsWith("$ACTION");

export function readDraft(): [string, string][] | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is [string, string] => Array.isArray(entry) && entry.length === 2 && entry.every((v) => typeof v === "string") && !skipped(entry[0])) : null;
  } catch {
    return null;
  }
}

export function writeDraft(form: HTMLFormElement) {
  try {
    const entries = [...new FormData(form)].filter((entry): entry is [string, string] => typeof entry[1] === "string" && !skipped(entry[0]));
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(entries));
  } catch {
    // Private windows and blocked storage: the wizard works without a draft.
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Puts a saved draft back into the form's controls. */
export function restoreDraft(form: HTMLFormElement, entries: [string, string][]) {
  const values = new Map<string, string[]>();
  for (const [name, value] of entries) values.set(name, [...(values.get(name) ?? []), value]);
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.name || skipped(element.name)) continue;
    const saved = values.get(element.name);
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
      // An unticked box is absent from the draft, so it is unticked; a radio group without a saved
      // choice keeps its default.
      if (saved) element.checked = saved.includes(element.value);
      else if (element.type === "checkbox") element.checked = false;
    } else if (saved) element.value = saved[0];
  }
}
