"use client";

import { type FormEvent, type RefObject, useCallback, useRef, useState } from "react";

import { TurnstileGate, loadTurnstile } from "@/lib/turnstile-client";

type Options = {
  siteKey: string | null;
  locale: "vi" | "en";
  /** Turnstile action name, checked on the server. */
  action: string;
  formRef: RefObject<HTMLFormElement | null>;
};

/**
 * Turnstile for a public form: call `start` on the form's first focus or touch, pass `onSubmit`
 * to the form and render a `<div ref={widgetRef} />` inside it (the widget adds the
 * `cf-turnstile-response` field). `reset` after every server answer, since tokens are single-use.
 */
export function useTurnstile({ siteKey, locale, action, formRef }: Options) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const gate = useRef(new TurnstileGate());
  const [waiting, setWaiting] = useState(false);

  const start = useCallback(() => {
    if (!siteKey || widgetId.current || !widgetRef.current) return;
    widgetId.current = "loading";
    loadTurnstile()
      .then((turnstile) => {
        if (!widgetRef.current) return;
        widgetId.current = turnstile.render(widgetRef.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          language: locale,
          callback: (value: string) => {
            if (gate.current.receive(value)) {
              setWaiting(false);
              formRef.current?.requestSubmit();
            }
          },
          "expired-callback": () => gate.current.clear(),
          "error-callback": () => {
            gate.current.fail();
            setWaiting(false);
          },
        });
      })
      .catch(() => {
        widgetId.current = null;
        gate.current.fail();
        setWaiting(false);
      });
  }, [siteKey, locale, action, formRef]);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      if (!siteKey || gate.current.allowSubmit()) return;
      event.preventDefault();
      setWaiting(true);
      start();
    },
    [siteKey, start],
  );

  const reset = useCallback(() => {
    if (!widgetId.current || widgetId.current === "loading") return;
    gate.current.clear();
    window.turnstile?.reset(widgetId.current);
  }, []);

  return { widgetRef, start, onSubmit, reset, waiting };
}
