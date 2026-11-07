import { type ConsentAction, type ConsentChoice, CONSENT_RETRY_KEY } from "@/lib/consent";
import { recordConsentChoice } from "@/modules/consent/consent.actions";

/** At most this many pending records wait for the retry (Phase 6 spec decision 7). */
const MAX_PENDING = 3;

type Entry = { id: string; action: ConsentAction; analytics: boolean; marketing: boolean; locale: "vi" | "en" };

function readPending(): Entry[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(CONSENT_RETRY_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? (value as Entry[]) : [];
  } catch {
    return [];
  }
}

function writePending(entries: Entry[]) {
  try {
    if (entries.length) window.localStorage.setItem(CONSENT_RETRY_KEY, JSON.stringify(entries.slice(-MAX_PENDING)));
    else window.localStorage.removeItem(CONSENT_RETRY_KEY);
  } catch {
    // Storage blocked: the record is simply not retried.
  }
}

async function send(entry: Entry): Promise<boolean> {
  try {
    return (await recordConsentChoice(entry)).status === "recorded";
  } catch {
    return false;
  }
}

const same = (a: Entry, b: Entry) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Records a choice that is already applied (the cookie is set first, so a failure never blocks
 * it). The record is kept as pending before the request and removed once it is stored, so a choice
 * whose request fails, or is cut off by a full page load, gets one retry on the next page view.
 */
export async function recordChoice(id: string, action: ConsentAction, choice: ConsentChoice, locale: "vi" | "en"): Promise<void> {
  const entry: Entry = { id, action, analytics: choice.analytics, marketing: choice.marketing, locale };
  writePending([...readPending(), entry]);
  if (!(await send(entry))) return;
  const pending = readPending();
  const index = pending.findIndex((item) => same(item, entry));
  if (index >= 0) pending.splice(index, 1);
  writePending(pending);
}

/** The one retry: the pending records are taken off the list before they are sent again. */
export async function retryPendingChoices(): Promise<void> {
  const pending = readPending();
  if (!pending.length) return;
  writePending([]);
  for (const entry of pending) await send(entry);
}
