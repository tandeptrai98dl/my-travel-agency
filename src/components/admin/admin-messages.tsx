import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/**
 * Gives client components under one admin page the Vietnamese strings they read with
 * `useTranslations("Admin.<namespace>")`, and nothing else (the admin is Vietnamese only, ADR-006).
 * `Admin.Errors` is always included because the protected layout's provider is replaced here.
 */
export async function AdminMessages({ namespaces, children }: { namespaces: string[]; children: React.ReactNode }) {
  const messages = await getMessages({ locale: "vi" });
  const admin = messages.Admin as Record<string, unknown>;
  const picked = Object.fromEntries(["Errors", ...namespaces].map((name) => [name, admin[name]]));
  return (
    <NextIntlClientProvider locale="vi" messages={{ Admin: picked }}>
      {children}
    </NextIntlClientProvider>
  );
}
