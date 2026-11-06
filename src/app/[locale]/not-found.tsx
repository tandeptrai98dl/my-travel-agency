import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading } from "@/components/typography/heading";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Localized 404; the designed version with tour suggestions arrives with the layout shell.
export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <main className="flex min-h-screen items-center">
      <Container className="flex flex-col items-center gap-6 text-center">
        <Eyebrow>404</Eyebrow>
        <Heading level={1} size="h1">
          {t("title")}
        </Heading>
        <p className="max-w-prose text-body-lg text-muted-foreground">{t("description")}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/">{t("home")}</Link>
        </Button>
      </Container>
    </main>
  );
}
