import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PageHeader } from "@/components/admin/page-header";
import { NewTourForm } from "@/components/admin/tours/new-tour-form";
import { rolesFor } from "@/lib/auth/permissions";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Thêm tour" };

export default async function NewTourPage() {
  await requireAdminAccess(rolesFor("tours.edit_content"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("Tours.newTour")}
        breadcrumbs={[{ label: t("Tours.title"), href: "/admin/tours" }, { label: t("Tours.newTour") }]}
        breadcrumbLabel={t("Shell.breadcrumb")}
      />
      <AdminMessages namespaces={["Tours", "Taxonomy", "Form", "Shell"]}>
        <NewTourForm />
      </AdminMessages>
    </div>
  );
}
