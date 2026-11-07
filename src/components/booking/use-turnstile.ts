"use client";

import { useCallback, useRef, useState } from "react";

type Api = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
};

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<Api> | null = null;
const api = () => (window as unknown as { turnstile?: Api }).turnstile;

function load(): Promise<Api> {
  scriptPromise ??= new Promise<Api>((resolve, reject) => {
    const existing = api();
    if (existing) return resolve(existing);
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      const loaded = api();
      if (loaded) resolve(loaded);
      else reject(new Error("turnstile missing"));
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile for the booking form: the script loads on the first interaction (no
 * third-party request on page load) and runs invisibly unless Cloudflare needs a click. Without a
 * site key (local, CI) it does nothing and the server skips the check outside production.
 */
export function useTurnstile(siteKey: string | null, locale: "vi" | "en", action: string) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const start = useCallback(() => {
    if (!siteKey || widget.current || !ref.current) return;
    widget.current = "loading";
    load()
      .then((turnstile) => {
        if (!ref.current) return;
        widget.current = turnstile.render(ref.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          language: locale,
          callback: (value: string) => setToken(value),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
      })
      .catch(() => {
        widget.current = null;
      });
  }, [siteKey, locale, action]);

  const reset = useCallback(() => {
    setToken(null);
    if (widget.current && widget.current !== "loading") api()?.reset(widget.current);
  }, []);

  return { ref, token, start, reset, required: Boolean(siteKey) };
}
