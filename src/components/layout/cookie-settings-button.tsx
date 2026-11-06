"use client";

import { CONSENT_OPEN_EVENT } from "@/lib/consent";

/** Reopens the cookie settings from anywhere (the footer link). */
export function CookieSettingsButton({ label, className }: { label: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
    >
      {label}
    </button>
  );
}
