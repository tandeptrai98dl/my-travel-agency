import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { DeleteContentButton } from "@/components/admin/content/delete-content-button";
import { PostEditor } from "@/components/admin/content/post-editor";
import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { rolesFor } from "@/lib/auth/permissions";
import { contentSlugPrefixes } from "@/modules/content/content-labels";
import { getPostEditor, listCategories } from "@/modules/content/content.service";
import { getMediaPickerLabels } from "@/modules/media/media-labels";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Sửa bài viết" };

type Props = { params: Promise<{ id: string }> };

export default async function EditPostPage({ params }: Props) {
  await requireAdminAccess(rolesFor("content.manage"));
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-4xl" aria-hidden="true" />}>
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
  const [editor, categories, pickerLabels] = await Promise.all([getPostEditor(id), listCategories(), getMediaPickerLabels()]);
  if (!editor) notFound();
  const { values } = editor;
  const title = values.translations.vi.title || values.translations.en.title || t("Content.untitled");
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t("Content.journal"), href: "/admin/journal" }, { label: title }]}
        breadcrumbLabel={t("Shell.breadcrumb")}
        actions={<StatusBadge kind="publish" status={values.status} label={t(`Taxonomy.statuses.${values.status}`)} />}
      />
      <AdminMessages namespaces={["Content", "Taxonomy", "Form", "Shell"]}>
        <PostEditor
          initial={values}
          cover={editor.cover}
          media={editor.media}
          categories={categories}
          prefixes={contentSlugPrefixes("post")}
          pickerLabels={pickerLabels}
          deleteAction={<DeleteContentButton kind="post" id={id} listHref="/admin/journal" />}
        />
      </AdminMessages>
    </>
  );
}
