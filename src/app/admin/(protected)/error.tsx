"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Error state for admin pages (a failed query, an unexpected error): explain and offer a retry. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Admin.Errors");
  useEffect(() => {
    // Reported to Sentry by onRequestError on the server; the digest links the two.
    console.error(error.digest ?? error.message);
  }, [error]);
  return (
    <div className="flex max-w-2xl flex-col gap-4 px-4 py-10 md:px-8">
      <Alert variant="destructive" live="assertive">
        <AlertTitle>{t("title")}</AlertTitle>
        <AlertDescription>
          {t("body")}
          {error.digest && (
            <>
              {" "}
              {t("reference", { digest: error.digest })}
            </>
          )}
        </AlertDescription>
      </Alert>
      <div>
        <Button onClick={reset}>{t("retry")}</Button>
      </div>
    </div>
  );
}
