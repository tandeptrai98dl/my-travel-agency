"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { CONSENT_EVENT, ESSENTIAL_ONLY, readConsentCookie } from "@/lib/consent";

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

type Loader = typeof import("./gtag");

/**
 * Google Analytics after consent (ADR-039). Renders nothing; without a measurement ID it does
 * nothing at all. The loader (`./gtag`) is imported only once the visitor has granted
 * "analytics", and it decides per route whether Google's script may load.
 */
export function Analytics() {
  const pathname = usePathname();
  const loader = useRef<Promise<Loader> | null>(null);

  const sync = useCallback(() => {
    if (!MEASUREMENT_ID) return;
    const choice = readConsentCookie(document.cookie);
    if (!loader.current) {
      if (!choice?.analytics) return;
      loader.current = import("./gtag");
    }
    const { pathname: path, search } = window.location;
    void loader.current.then((module) => module.sync(MEASUREMENT_ID, choice ?? ESSENTIAL_ONLY, path, search));
  }, []);

  useEffect(() => {
    if (!MEASUREMENT_ID) return;
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, [sync]);

  useEffect(() => {
    sync();
  }, [pathname, sync]);

  return null;
}
