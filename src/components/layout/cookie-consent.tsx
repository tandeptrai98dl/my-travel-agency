"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Analytics } from "@/components/analytics/analytics";
import { CONSENT_OPEN_EVENT, CONSENT_RETRY_KEY, readConsentCookie } from "@/lib/consent";

// The banner and its settings load only for a visitor who has not chosen yet, or when the footer's
// "Cookie settings" asks for them: returning visitors never download them, and they stay out of the
// initial JavaScript of public pages (Phase 3 spec decision 16).
const CookieConsentBanner = dynamic(() => import("./cookie-consent-banner").then((module) => module.CookieConsentBanner), { ssr: false });

type Opening = { settingsFrom: HTMLElement | null | false };

/** Mounts the cookie consent banner when it is needed (see `CookieConsentBanner`), and analytics. */
export function CookieConsent({ privacyHref }: { privacyHref: string }) {
  const [opening, setOpening] = useState<Opening | null>(null);
  const pathname = usePathname();

  // A choice whose record failed is retried once on the next page view (ADR-039); the retry code
  // loads only when something is pending.
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(CONSENT_RETRY_KEY)) return;
    } catch {
      return;
    }
    void import("./consent-record").then((module) => module.retryPendingChoices());
  }, [pathname]);

  useEffect(() => {
    if (readConsentCookie(document.cookie) === null) setOpening({ settingsFrom: false });
    // A "Cookie settings" request loads the banner with its settings open, also while its chunk is
    // still loading (the latest request wins). Once mounted, the banner listens itself and reads
    // `openSettingsFrom` only on mount, so later updates here change nothing.
    const open = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      setOpening({ settingsFrom: detail instanceof HTMLElement ? detail : null });
    };
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  return (
    <>
      {opening ? <CookieConsentBanner privacyHref={privacyHref} openSettingsFrom={opening.settingsFrom} /> : null}
      {/* Google Analytics follows the choice (ADR-039): mounted wherever the banner is. */}
      <Analytics />
    </>
  );
}
