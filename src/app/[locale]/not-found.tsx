import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading } from "@/components/typography/heading";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Designed, localized 404 (DESIGN_SYSTEM.md "States"). Tour suggestions come with the catalog
// pages in Phase 3.
export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <div className="flex min-h-[70vh] items-center py-20">
      <Container className="flex flex-col items-center gap-6 text-center">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <Heading level={1} size="h1">
          {t("title")}
        </Heading>
        <div aria-hidden="true" className="h-px w-16 bg-gold" />
        <p className="max-w-prose text-body-lg text-muted-foreground">{t("description")}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/tours">{t("tours")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/contact">{t("contact")}</Link>
          </Button>
          <Button asChild variant="link" className="self-center">
            <Link href="/">{t("home")}</Link>
          </Button>
        </div>
      </Container>
    </div>
  );
}
