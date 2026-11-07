"use client";

import { useEffect } from "react";

import { buttonVariants } from "@/components/ui/button-variants";

import { useLabels, useShellLocale } from "./labels";

/**
 * Error state of a public page whose read failed (an error, never a 404; Phase 3 spec decision
 * 12). Plain markup and labels so it adds almost nothing to the initial JavaScript: every route
 * with an error.tsx loads this in its own chunk, so the home link is a plain `<a>` (a full load
 * after an error is fine) instead of LocaleLink and the route map.
 */
export function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useLabels("PageError");
  const home = useShellLocale() === "vi" ? "/" : "/en";
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-24 md:px-8 md:py-32">
      <h1 className="text-balance font-serif text-h2 font-medium text-foreground md:text-h2-lg">{t("title")}</h1>
      <p className="max-w-prose text-body-lg text-muted-foreground">{t("text")}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonVariants()} onClick={reset}>
          {t("retry")}
        </button>
        <a href={home} className={buttonVariants({ variant: "outline" })}>
          {t("back")}
        </a>
      </div>
    </div>
  );
}
