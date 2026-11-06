import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminMessages } from "@/components/admin/admin-messages";
import { CategoryForm } from "@/components/admin/content/category-form";
import { PageHeader } from "@/components/admin/page-header";
import { rolesFor } from "@/lib/auth/permissions";
import { contentSlugPrefixes } from "@/modules/content/content-labels";
import { newCategoryValues } from "@/modules/content/content.service";

import { requireAdminAccess } from "../../../../admin-gate";

export const metadata: Metadata = { title: "Thêm chủ đề" };

export default async function NewCategoryPage() {
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("Content.newCategory")}
        breadcrumbs={[
          { label: t("Content.journal"), href: "/admin/journal" },
          { label: t("Content.categories"), href: "/admin/journal/categories" },
          { label: t("Content.newCategory") },
        ]}
        breadcrumbLabel={t("Shell.breadcrumb")}
      />
      <AdminMessages namespaces={["Content", "Taxonomy", "Form", "Shell"]}>
        <CategoryForm initial={newCategoryValues()} prefixes={contentSlugPrefixes("category")} />
      </AdminMessages>
    </div>
  );
}
