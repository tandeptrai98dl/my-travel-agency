import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PageHeader } from "@/components/admin/page-header";
import { DuplicateTourButton } from "@/components/admin/tours/duplicate-tour-button";
import { TourEditor } from "@/components/admin/tours/tour-editor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { getPathname } from "@/i18n/navigation";
import { can, rolesFor } from "@/lib/auth/permissions";
import { getEditorOptions, getTourEditor } from "@/modules/catalog/tours/tours.service";
import { getMediaPickerLabels } from "@/modules/media/media-labels";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Sửa tour" };

type Props = { params: Promise<{ id: string }> };

/** Tour editor page (spec Phase 2 step 13). Only editors and admins can open it. */
export default async function EditTourPage({ params }: Props) {
  await requireAdminAccess(rolesFor("tours.edit_content"));
  return (
    <div className="flex flex-col gap-8 px-4 pt-10 md:px-8">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-4xl" aria-hidden="true" />}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}

function slugPrefix(locale: "vi" | "en") {
  return getPathname({ href: { pathname: "/tours/[slug]", params: { slug: "_" } }, locale }).replace(/_$/, "");
}

async function Editor({ params }: Props) {
  const id = z.uuid().safeParse((await params).id).data;
  if (!id) notFound();
  const user = await requireAdminAccess(rolesFor("tours.edit_content"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const [editor, options, pickerLabels] = await Promise.all([
    getTourEditor(id),
    getEditorOptions(),
    getMediaPickerLabels(),
  ]);
  if (!editor) notFound();
  const { values } = editor;
  const title = values.translations.vi.title || values.translations.en.title || values.code;
  return (
    <>
      <PageHeader
        title={title}
        description={values.code}
        breadcrumbs={[{ label: t("Tours.title"), href: "/admin/tours" }, { label: title }]}
        breadcrumbLabel={t("Shell.breadcrumb")}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge kind="publish" status={values.status} label={t(`Tours.statuses.${values.status}`)} />
            {/* Staff preview of the public page, drafts included (Phase 3 spec decision 17). */}
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/tours/${id}/preview?locale=vi`}>{t("Tours.preview")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/tours/${id}/preview?locale=en`}>{t("Tours.previewEn")}</Link>
            </Button>
          </div>
        }
      />
      <AdminMessages namespaces={["Tours", "Taxonomy", "Form", "Shell"]}>
        <TourEditor
          initial={values}
          media={editor.media}
          canEditPrices={editor.canEditPrices && can(user.role, "prices.edit")}
          activeDepartures={editor.activeDepartures}
          options={options}
          prefixes={{ vi: slugPrefix("vi"), en: slugPrefix("en") }}
          pickerLabels={pickerLabels}
          actions={<DuplicateTourButton id={id} code={values.code} />}
        />
      </AdminMessages>
    </>
  );
}
