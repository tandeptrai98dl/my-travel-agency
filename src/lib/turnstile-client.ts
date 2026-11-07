/**
 * Browser side of Cloudflare Turnstile for public forms (ADR-029): the script loads once, on the
 * visitor's first interaction, and a submit made before the token arrives waits for it.
 */

export type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Token state outside React. The token callback and the re-submit it triggers run before React
 * re-renders, so a submit handler that read the token from state would still see none and wait
 * forever; reading it from here sees the token at once.
 */
export class TurnstileGate {
  private token: string | null = null;
  private waiting = false;

  /** On submit: true when it may go ahead; otherwise it waits for the next token. */
  allowSubmit(): boolean {
    if (this.token) return true;
    this.waiting = true;
    return false;
  }

  /** A new token: true when a waiting submit should be sent again now. */
  receive(token: string): boolean {
    this.token = token;
    const resend = this.waiting;
    this.waiting = false;
    return resend;
  }

  /** The token expired or was used (Turnstile tokens are single-use). */
  clear(): void {
    this.token = null;
  }

  /** The widget failed: no token, nothing waiting. */
  fail(): void {
    this.token = null;
    this.waiting = false;
  }
}
