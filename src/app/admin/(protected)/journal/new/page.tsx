import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PostEditor } from "@/components/admin/content/post-editor";
import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor } from "@/lib/auth/permissions";
import { contentSlugPrefixes } from "@/modules/content/content-labels";
import { listCategories, newPostValues } from "@/modules/content/content.service";
import { getMediaPickerLabels } from "@/modules/media/media-labels";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Viết bài" };

export default async function NewPostPage() {
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("Content.newPost")}
        breadcrumbs={[{ label: t("Content.journal"), href: "/admin/journal" }, { label: t("Content.newPost") }]}
        breadcrumbLabel={t("Shell.breadcrumb")}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-4xl" aria-hidden="true" />}>
        <Editor />
      </Suspense>
    </div>
  );
}

async function Editor() {
  const [categories, pickerLabels] = await Promise.all([listCategories(), getMediaPickerLabels()]);
  return (
    <AdminMessages namespaces={["Content", "Taxonomy", "Form", "Shell"]}>
      <PostEditor
        initial={newPostValues()}
        cover={null}
        media={{}}
        categories={categories}
        prefixes={contentSlugPrefixes("post")}
        pickerLabels={pickerLabels}
      />
    </AdminMessages>
  );
}
