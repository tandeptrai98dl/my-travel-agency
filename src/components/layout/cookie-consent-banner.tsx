"use client";

import dynamic from "next/dynamic";
import NextLink from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import {
  ALL_ACCEPTED,
  consentAction,
  CONSENT_EVENT,
  CONSENT_OPEN_EVENT,
  type ConsentChoice,
  consentCookieString,
  type ConsentSource,
  ESSENTIAL_ONLY,
  newConsentId,
  readConsentCookie,
  readConsentRecord,
} from "@/lib/consent";
import { recordChoice } from "./consent-record";
import { useLabels, useShellLocale } from "./labels";

// The settings dialog (Radix dialog + switch) loads only when opened, keeping it out of the
// initial JS on public pages.
const ConsentSettingsDialog = dynamic(() => import("./consent-settings-dialog"), { ssr: false });

/** Continues from the main content without jumping to the top of the page. */
function focusMain() {
  document.getElementById("main")?.focus({ preventScroll: true });
}

/**
 * Cookie consent (spec step 9; Decree 13/2023 consent before collection). `privacyHref` is the
 * privacy policy's real path in this language, or the contact page until it is published. Nothing optional loads
 * before a choice; "Essential only" is as easy as "Accept all". The choice lives in a first-party
 * cookie so cached pages stay static, and a `consentchange` event tells GA4 Consent Mode
 * (Phase 3/6). The banner is fixed to the bottom, so it causes no layout shift. Loaded on demand by
 * `CookieConsent`.
 */
export function CookieConsentBanner({ privacyHref, openSettingsFrom = false }: { privacyHref: string; openSettingsFrom?: HTMLElement | null | false }) {
  const t = useLabels("Consent");
  const locale = useShellLocale();
  const titleId = useId();
  const [decided, setDecided] = useState<ConsentChoice | null | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [draft, setDraft] = useState<ConsentChoice>(ESSENTIAL_ONLY);
  const bannerRef = useRef<HTMLElement>(null);
  // Element that opened the settings dialog, to return focus to it (WCAG 2.4.3).
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const stored = readConsentCookie(document.cookie);
    setDecided(stored);
    setDraft(stored ?? ESSENTIAL_ONLY);
    const open = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      openerRef.current = detail instanceof HTMLElement ? detail : null;
      setDraft(readConsentCookie(document.cookie) ?? ESSENTIAL_ONLY);
      setSettingsLoaded(true);
      setSettingsOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    // Loaded by "Cookie settings" (`CookieConsent`): open the settings for that request.
    if (openSettingsFrom !== false) open(new CustomEvent(CONSENT_OPEN_EVENT, { detail: openSettingsFrom }));
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
    // Only the request that loaded the banner; later ones arrive as events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stays mounted while the settings dialog is open, so focus can return to "Customise".
  const bannerVisible = decided === null;

  // Lets the floating contact buttons step aside on small screens while the banner is up.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-consent-open", bannerVisible);
  }, [bannerVisible]);

  const save = useCallback((choice: ConsentChoice, source: ConsentSource) => {
    const focusWasInBanner = bannerRef.current?.contains(document.activeElement) ?? false;
    // The choice applies first (cookie and event); recording its proof follows and may fail
    // without blocking it (ADR-039). A changed choice keeps the cookie's pseudonymous record id.
    const previous = readConsentRecord(document.cookie);
    const id = previous?.id ?? newConsentId();
    document.cookie = consentCookieString(choice, window.location.protocol === "https:", id);
    setDecided(choice);
    setSettingsOpen(false);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
    void recordChoice(id, consentAction(previous?.choice ?? null, choice, source), choice, locale);
    // The banner disappears with the focused button; continue from the main content.
    if (focusWasInBanner) requestAnimationFrame(focusMain);
  }, [locale]);

  const restoreFocus = useCallback(() => {
    const opener = openerRef.current;
    if (opener?.isConnected && opener.offsetParent !== null) opener.focus();
    else focusMain();
  }, []);

  // Publishes the banner's height so scroll padding keeps focused elements above it (WCAG 2.4.11).
  useEffect(() => {
    const banner = bannerRef.current;
    const root = document.documentElement;
    if (!bannerVisible || !banner) return;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--consent-banner-h", `${banner.getBoundingClientRect().height}px`);
    });
    observer.observe(banner);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--consent-banner-h");
    };
  }, [bannerVisible]);

  return (
    <>
      {bannerVisible && (
        <section
          ref={bannerRef}
          role="region"
          aria-labelledby={titleId}
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card text-card-foreground md:inset-x-auto md:bottom-6 md:right-6 md:max-w-md md:rounded-lg md:border"
        >
          <div className="flex flex-col gap-4 p-5 md:p-6">
            <h2 id={titleId} className="font-serif text-h3 font-semibold">
              {t("title")}
            </h2>
            <p className="text-small text-muted-foreground">
              {t("body")}{" "}
              <NextLink
                href={privacyHref}
                className="text-foreground underline decoration-gold underline-offset-4"
              >
                {t("privacyLink")}
              </NextLink>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" className={buttonVariants()} onClick={() => save(ALL_ACCEPTED, "accept_all")}>
                {t("acceptAll")}
              </button>
              {/* Same weight as "Accept all": refusing is as easy as accepting. */}
              <button type="button" className={buttonVariants()} onClick={() => save(ESSENTIAL_ONLY, "essential_only")}>
                {t("rejectAll")}
              </button>
              <button
                type="button"
                className={buttonVariants({ variant: "ghost" })}
                onClick={(event) => {
                  openerRef.current = event.currentTarget;
                  setSettingsLoaded(true);
                  setSettingsOpen(true);
                }}
              >
                {t("settings")}
              </button>
            </div>
          </div>
        </section>
      )}

      {settingsLoaded && (
        <ConsentSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          draft={draft}
          onDraftChange={setDraft}
          onSave={save}
          onCloseAutoFocus={restoreFocus}
        />
      )}
    </>
  );
}
