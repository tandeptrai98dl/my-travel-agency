import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PageHeader } from "@/components/admin/page-header";
import { DeleteEntityButton } from "@/components/admin/taxonomy/delete-entity-button";
import { TravelStyleForm } from "@/components/admin/taxonomy/travel-style-form";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor } from "@/lib/auth/permissions";
import { getMediaPickerLabels } from "@/modules/media/media-labels";
import { slugPrefixes } from "@/modules/catalog/taxonomy/taxonomy-labels";
import { getTravelStyle } from "@/modules/catalog/taxonomy/taxonomy.service";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Sửa phong cách" };

type Props = { params: Promise<{ id: string }> };

export default async function EditTravelStylePage({ params }: Props) {
  await requireAdminAccess(rolesFor("content.manage"));
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-3xl" aria-hidden="true" />}>
        <EditTravelStyle params={params} />
      </Suspense>
    </div>
  );
}

async function EditTravelStyle({ params }: Props) {
  const id = z.uuid().safeParse((await params).id).data;
  if (!id) notFound();
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  const shell = await getTranslations({ locale: "vi", namespace: "Admin.Shell" });
  const [detail, pickerLabels] = await Promise.all([getTravelStyle(id), getMediaPickerLabels()]);
  if (!detail) notFound();
  const name = detail.values.translations.vi.name || detail.values.key;
  return (
    <>
      <PageHeader
        title={name}
        breadcrumbs={[{ label: t("travelStyles"), href: "/admin/travel-styles" }, { label: name }]}
        breadcrumbLabel={shell("breadcrumb")}
      />
      <AdminMessages namespaces={["Taxonomy", "Form", "Shell"]}>
        <TravelStyleForm
          initial={detail.values}
          hero={detail.hero}
          prefixes={slugPrefixes("travelStyle")}
          pickerLabels={pickerLabels}
          deleteAction={<DeleteEntityButton kind="travelStyle" id={id} listHref="/admin/travel-styles" />}
        />
      </AdminMessages>
    </>
  );
}
