import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PageHeader } from "@/components/admin/page-header";
import { DeleteEntityButton } from "@/components/admin/taxonomy/delete-entity-button";
import { DestinationForm } from "@/components/admin/taxonomy/destination-form";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor } from "@/lib/auth/permissions";
import { getMediaPickerLabels } from "@/modules/media/media-labels";
import { slugPrefixes } from "@/modules/catalog/taxonomy/taxonomy-labels";
import { getDestination, listParentOptions } from "@/modules/catalog/taxonomy/taxonomy.service";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Sửa điểm đến" };

type Props = { params: Promise<{ id: string }> };

export default async function EditDestinationPage({ params }: Props) {
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  const shell = await getTranslations({ locale: "vi", namespace: "Admin.Shell" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-3xl" aria-hidden="true" />}>
        <EditDestination params={params} listLabel={t("destinations")} backLabel={shell("breadcrumb")} />
      </Suspense>
    </div>
  );
}

async function EditDestination({ params, listLabel, backLabel }: Props & { listLabel: string; backLabel: string }) {
  const id = z.uuid().safeParse((await params).id).data;
  if (!id) notFound();
  const [detail, parents, pickerLabels] = await Promise.all([
    getDestination(id),
    listParentOptions(),
    getMediaPickerLabels(),
  ]);
  if (!detail) notFound();
  const name = detail.values.translations.vi.name || detail.values.key;
  return (
    <>
      <PageHeader
        title={name}
        breadcrumbs={[{ label: listLabel, href: "/admin/destinations" }, { label: name }]}
        breadcrumbLabel={backLabel}
      />
      <AdminMessages namespaces={["Taxonomy", "Content", "Form", "Shell"]}>
        <DestinationForm
          initial={detail.values}
          hero={detail.hero}
          parents={parents}
          prefixes={slugPrefixes("destination")}
          pickerLabels={pickerLabels}
          contentMedia={detail.contentMedia}
          deleteAction={<DeleteEntityButton kind="destination" id={id} listHref="/admin/destinations" />}
        />
      </AdminMessages>
    </>
  );
}
