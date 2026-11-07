"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { CONSENT_OPEN_EVENT, readConsentCookie } from "@/lib/consent";

// The banner and its settings load only for a visitor who has not chosen yet, or when the footer's
// "Cookie settings" asks for them: returning visitors never download them, and they stay out of the
// initial JavaScript of public pages (Phase 3 spec decision 16).
const CookieConsentBanner = dynamic(() => import("./cookie-consent-banner").then((module) => module.CookieConsentBanner), { ssr: false });

type Opening = { settingsFrom: HTMLElement | null | false };

/** Mounts the cookie consent banner when it is needed (see `CookieConsentBanner`). */
export function CookieConsent({ privacyHref }: { privacyHref: string }) {
  const [opening, setOpening] = useState<Opening | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (readConsentCookie(document.cookie) === null) {
      loaded.current = true;
      setOpening({ settingsFrom: false });
    }
    // Before the banner is loaded, a "Cookie settings" request loads it with its settings open;
    // afterwards the banner listens itself.
    const open = (event: Event) => {
      if (loaded.current) return;
      loaded.current = true;
      const detail = event instanceof CustomEvent ? event.detail : null;
      setOpening({ settingsFrom: detail instanceof HTMLElement ? detail : null });
    };
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  return opening ? <CookieConsentBanner privacyHref={privacyHref} openSettingsFrom={opening.settingsFrom} /> : null;
}
