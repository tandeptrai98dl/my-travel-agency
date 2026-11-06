"use client";

import { CONSENT_OPEN_EVENT } from "@/lib/consent";

/** Reopens the cookie settings from anywhere (the footer link). */
export function CookieSettingsButton({ label, className }: { label: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      // The opener travels with the event: Safari does not focus buttons on click, so
      // `document.activeElement` would be <body> and focus could not return here.
      onClick={(event) =>
        window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT, { detail: event.currentTarget }))
      }
    >
      {label}
    </button>
  );
}
