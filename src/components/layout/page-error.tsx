"use client";

import { useEffect } from "react";

import { buttonVariants } from "@/components/ui/button-variants";

import { useLabels } from "./labels";
import { LocaleLink } from "./locale-link";

/**
 * Error state of a public page whose read failed (an error, never a 404; Phase 3 spec decision
 * 12). Plain markup and labels so it adds almost nothing to the initial JavaScript.
 */
export function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useLabels("PageError");
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
        <LocaleLink href="/" className={buttonVariants({ variant: "outline" })}>
          {t("back")}
        </LocaleLink>
      </div>
    </div>
  );
}
