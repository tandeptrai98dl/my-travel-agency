import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { CategoryForm } from "@/components/admin/content/category-form";
import { DeleteContentButton } from "@/components/admin/content/delete-content-button";
import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor } from "@/lib/auth/permissions";
import { contentSlugPrefixes } from "@/modules/content/content-labels";
import { getCategory } from "@/modules/content/content.service";

import { requireAdminAccess } from "../../../../admin-gate";

export const metadata: Metadata = { title: "Sửa chủ đề" };

type Props = { params: Promise<{ id: string }> };

export default async function EditCategoryPage({ params }: Props) {
  await requireAdminAccess(rolesFor("content.manage"));
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-3xl" aria-hidden="true" />}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}

async function Editor({ params }: Props) {
  const id = z.uuid().safeParse((await params).id).data;
  if (!id) notFound();
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const values = await getCategory(id);
  if (!values) notFound();
  const title = values.translations.vi.name || values.translations.en.name;
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: t("Content.journal"), href: "/admin/journal" },
          { label: t("Content.categories"), href: "/admin/journal/categories" },
          { label: title },
        ]}
        breadcrumbLabel={t("Shell.breadcrumb")}
      />
      <AdminMessages namespaces={["Content", "Taxonomy", "Form", "Shell"]}>
        <CategoryForm
          initial={values}
          prefixes={contentSlugPrefixes("category")}
          deleteAction={<DeleteContentButton kind="category" id={id} listHref="/admin/journal/categories" />}
        />
      </AdminMessages>
    </>
  );
}
