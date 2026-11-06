import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

// Minimal localized 404; Phase 1 replaces it with the designed NotFound page.
export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-xl text-center">
        <h1 className="text-3xl font-medium">{t("title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("description")}</p>
        <Link href="/" className="mt-8 inline-block underline underline-offset-4">
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
