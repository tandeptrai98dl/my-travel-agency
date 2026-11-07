import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { StaffCard } from "../staff-card";

export const metadata: Metadata = { title: "Không mở được liên kết" };

type Props = { searchParams: Promise<{ error?: string }> };

const KNOWN = new Set(["link", "oauth", "inactive"]);

/** Email-link and OAuth errors: a fixed message per code (never text from the URL). */
export default function AuthErrorPage({ searchParams }: Props) {
  return (
    <Suspense>
      <ErrorContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ErrorContent({ searchParams }: Props) {
  const { error } = await searchParams;
  const t = await getTranslations({ locale: "vi", namespace: "StaffAuth" });
  const key = error && KNOWN.has(error) ? error : "default";
  return (
    <StaffCard title={t("errorTitle")} intro={t(`errors.${key}` as "errors.default")}>
      <div className="flex flex-col gap-2 text-small">
        <Link href="/dang-nhap" className="self-start underline decoration-gold underline-offset-4">
          {t("customerLink")}
        </Link>
        <Link href="/auth/login" className="self-start text-muted-foreground underline underline-offset-4">
          {t("back")}
        </Link>
      </div>
    </StaffCard>
  );
}
