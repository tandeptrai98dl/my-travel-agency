import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PageEditor } from "@/components/admin/content/page-editor";
import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { rolesFor } from "@/lib/auth/permissions";
import { pageSlugPrefixes } from "@/modules/content/content-labels";
import { PAGE_KEYS } from "@/modules/content/content.schemas";
import { getPageEditor } from "@/modules/content/content.service";
import { getMediaPickerLabels } from "@/modules/media/media-labels";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Sửa trang" };

type Props = { params: Promise<{ key: string }> };

export default async function EditPagePage({ params }: Props) {
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
  const key = z.enum(PAGE_KEYS).safeParse((await params).key).data;
  if (!key) notFound();
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const [editor, pickerLabels] = await Promise.all([getPageEditor(key), getMediaPickerLabels()]);
  const title = t(`Content.pageKeys.${key}`);
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t("Content.pages"), href: "/admin/pages" }, { label: title }]}
        breadcrumbLabel={t("Shell.breadcrumb")}
        actions={
          editor.pageId ? (
            <StatusBadge kind="publish" status={editor.values.status} label={t(`Taxonomy.statuses.${editor.values.status}`)} />
          ) : undefined
        }
      />
      <AdminMessages namespaces={["Content", "Taxonomy", "Form", "Shell"]}>
        <PageEditor
          initial={editor.values}
          pageId={editor.pageId}
          media={editor.media}
          prefixes={pageSlugPrefixes(key)}
          pickerLabels={pickerLabels}
        />
      </AdminMessages>
    </>
  );
}
