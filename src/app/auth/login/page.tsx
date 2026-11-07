import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { authLabels } from "@/app/(secure)/[locale]/(auth)/labels";
import { AuthForm } from "@/components/account/auth-form";
import { Skeleton } from "@/components/ui/skeleton";
import { signInAction } from "@/modules/identity/customer-auth.actions";

import { StaffCard } from "../staff-card";

export const metadata: Metadata = { title: "Đăng nhập" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Staff sign-in (Vietnamese): the same Server Action as the customer page; customers land on
 * their account. Shown even to a signed-in user, so staff can switch accounts (a new sign-in
 * replaces the session).
 */
export default function StaffLoginPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full" aria-hidden="true" />}>
      <StaffLogin searchParams={searchParams} />
    </Suspense>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

async function StaffLogin({ searchParams }: Props) {
  const query = await searchParams;
  const [t, tAuth] = await Promise.all([getTranslations({ locale: "vi", namespace: "StaffAuth" }), getTranslations({ locale: "vi", namespace: "Auth" })]);
  const labels = await authLabels("vi", tAuth("login.submit"), tAuth("login.pending"));
  return (
    <StaffCard title={t("title")} intro={t("intro")}>
      {first(query.error) === "staff_oauth" ? (
        <p role="alert" className="text-small text-destructive">
          {t("staffOauth")}
        </p>
      ) : null}
      <AuthForm
        action={signInAction}
        locale="vi"
        hidden={{ next: "/admin", surface: "staff" }}
        labels={labels}
        doneOn={[]}
        testId="staff-login-form"
        fields={[
          { name: "email", type: "email", label: tAuth("fields.email"), autoComplete: "email", required: true },
          { name: "password", type: "password", label: tAuth("fields.password"), autoComplete: "current-password", required: true },
        ]}
      />
      <div className="flex flex-col gap-2 text-small">
        <Link href="/auth/forgot-password" className="self-start underline decoration-gold underline-offset-4">
          {tAuth("login.forgot")}
        </Link>
        <Link href="/dang-nhap" className="self-start text-muted-foreground underline underline-offset-4">
          {t("customerLink")}
        </Link>
      </div>
    </StaffCard>
  );
}
