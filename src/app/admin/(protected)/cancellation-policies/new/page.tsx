import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PageHeader } from "@/components/admin/page-header";
import { CancellationPolicyForm } from "@/components/admin/taxonomy/cancellation-policy-form";
import { rolesFor } from "@/lib/auth/permissions";
import { newCancellationPolicyValues } from "@/modules/catalog/taxonomy/taxonomy.service";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Thêm chính sách huỷ" };

export default async function NewCancellationPolicyPage() {
  await requireAdminAccess(rolesFor("settings.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  const shell = await getTranslations({ locale: "vi", namespace: "Admin.Shell" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("newPolicy")}
        breadcrumbs={[{ label: t("policies"), href: "/admin/cancellation-policies" }, { label: t("newPolicy") }]}
        breadcrumbLabel={shell("breadcrumb")}
      />
      <AdminMessages namespaces={["Taxonomy", "Form", "Shell"]}>
        <CancellationPolicyForm initial={newCancellationPolicyValues()} />
      </AdminMessages>
    </div>
  );
}
