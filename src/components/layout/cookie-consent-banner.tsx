"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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

/**
 * Cookie consent (spec step 9; Decree 13/2023 consent before collection). Nothing optional loads
 * before a choice; "Essential only" is as easy as "Accept all". The choice lives in a first-party
 * cookie so cached pages stay static, and a `consentchange` event tells GA4 Consent Mode
 * (Phase 3/6). The banner is fixed to the bottom, so it causes no layout shift.
 */
export function CookieConsentBanner() {
  const t = useTranslations("Consent");
  const tNav = useTranslations("Navigation");
  const titleId = useId();
  const [decided, setDecided] = useState<ConsentChoice | null | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<ConsentChoice>(ESSENTIAL_ONLY);

  useEffect(() => {
    const stored = readConsentCookie(document.cookie);
    setDecided(stored);
    setDraft(stored ?? ESSENTIAL_ONLY);
    const open = () => {
      setDraft(readConsentCookie(document.cookie) ?? ESSENTIAL_ONLY);
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
              <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
                {t("settings")}
              </Button>
            </div>
          </div>
        </section>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent closeLabel={tNav("close")}>
          <DialogHeader>
            <DialogTitle>{t("settingsTitle")}</DialogTitle>
            <DialogDescription>{t("settingsBody")}</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col divide-y divide-border">
            <ConsentRow title={t("essential")} description={t("essentialDesc")}>
              <span className="text-small text-muted-foreground">{t("alwaysOn")}</span>
            </ConsentRow>
            <ConsentRow title={t("analytics")} description={t("analyticsDesc")}>
              <Switch
                checked={draft.analytics}
                onCheckedChange={(analytics) => setDraft((d) => ({ ...d, analytics }))}
                aria-label={t("analytics")}
              />
            </ConsentRow>
            <ConsentRow title={t("marketing")} description={t("marketingDesc")}>
              <Switch
                checked={draft.marketing}
                onCheckedChange={(marketing) => setDraft((d) => ({ ...d, marketing }))}
                aria-label={t("marketing")}
              />
            </ConsentRow>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => save(ESSENTIAL_ONLY)}>
              {t("rejectAll")}
            </Button>
            <Button onClick={() => save(draft)}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConsentRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-6 py-4">
      <div className="flex flex-col gap-1">
        <span className="font-medium">{title}</span>
        <span className="text-small text-muted-foreground">{description}</span>
      </div>
      <div className="flex min-h-6 items-center">{children}</div>
    </li>
  );
}
