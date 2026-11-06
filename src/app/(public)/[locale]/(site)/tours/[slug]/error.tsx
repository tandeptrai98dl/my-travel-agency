"use client";

import { useEffect } from "react";

import { useLabels } from "@/components/layout/labels";
import { LocaleLink } from "@/components/layout/locale-link";
import { buttonVariants } from "@/components/ui/button-variants";

/** A tour that could not be read (an error, never a 404; Phase 3 spec decision 12). */
export default function TourError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useLabels("TourDetailError");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-24 md:px-8 md:py-32">
      {/* Plain markup (Container and Heading use tailwind-merge, which a client file would ship). */}
      <h1 className="text-balance font-serif text-h2 font-medium text-foreground md:text-h2-lg">{t("title")}</h1>
      <p className="max-w-prose text-body-lg text-muted-foreground">{t("text")}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonVariants()} onClick={reset}>
          {t("retry")}
        </button>
        <LocaleLink href="/tours" className={buttonVariants({ variant: "outline" })}>
          {t("back")}
        </LocaleLink>
      </div>
    </div>
  );
}
