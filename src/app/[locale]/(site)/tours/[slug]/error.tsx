"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Container } from "@/components/layout/container";
import { Heading } from "@/components/typography/heading";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** A tour that could not be read (an error, never a 404; Phase 3 spec decision 12). */
export default function TourError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("TourDetail.error");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container className="flex flex-col items-start gap-6 py-24 md:py-32">
      <Heading level={1} size="h2">
        {t("title")}
      </Heading>
      <p className="max-w-prose text-body-lg text-muted-foreground">{t("text")}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>{t("retry")}</Button>
        <Button asChild variant="outline">
          <Link href="/tours">{t("back")}</Link>
        </Button>
      </div>
    </Container>
  );
}
