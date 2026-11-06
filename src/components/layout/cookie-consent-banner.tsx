"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  ALL_ACCEPTED,
  CONSENT_EVENT,
  CONSENT_OPEN_EVENT,
  type ConsentChoice,
  consentCookieString,
  ESSENTIAL_ONLY,
  readConsentCookie,
} from "@/lib/consent";

// The settings dialog (Radix dialog + switch) loads only when opened, keeping it out of the
// initial JS on public pages.
const ConsentSettingsDialog = dynamic(() => import("./consent-settings-dialog"), { ssr: false });

/**
 * Cookie consent (spec step 9; Decree 13/2023 consent before collection). Nothing optional loads
 * before a choice; "Essential only" is as easy as "Accept all". The choice lives in a first-party
 * cookie so cached pages stay static, and a `consentchange` event tells GA4 Consent Mode
 * (Phase 3/6). The banner is fixed to the bottom, so it causes no layout shift.
 */
export function CookieConsentBanner() {
  const t = useTranslations("Consent");
  const titleId = useId();
  const [decided, setDecided] = useState<ConsentChoice | null | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [draft, setDraft] = useState<ConsentChoice>(ESSENTIAL_ONLY);

  useEffect(() => {
    const stored = readConsentCookie(document.cookie);
    setDecided(stored);
    setDraft(stored ?? ESSENTIAL_ONLY);
    const open = () => {
      setDraft(readConsentCookie(document.cookie) ?? ESSENTIAL_ONLY);
      setSettingsLoaded(true);
      setSettingsOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  const bannerVisible = decided === null && !settingsOpen;

  // Lets the floating contact buttons step aside on small screens while the banner is up.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-consent-open", bannerVisible);
  }, [bannerVisible]);

  const save = useCallback((choice: ConsentChoice) => {
    document.cookie = consentCookieString(choice, window.location.protocol === "https:");
    setDecided(choice);
    setSettingsOpen(false);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
  }, []);

  return (
    <>
      {bannerVisible && (
        <section
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
              <Link
                href={{ pathname: "/policies/[slug]", params: { slug: "privacy" } }}
                className="text-foreground underline decoration-gold underline-offset-4"
              >
                {t("privacyLink")}
              </Link>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button onClick={() => save(ALL_ACCEPTED)}>{t("acceptAll")}</Button>
              <Button variant="outline" onClick={() => save(ESSENTIAL_ONLY)}>
                {t("rejectAll")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSettingsLoaded(true);
                  setSettingsOpen(true);
                }}
              >
                {t("settings")}
              </Button>
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
        />
      )}
    </>
  );
}
