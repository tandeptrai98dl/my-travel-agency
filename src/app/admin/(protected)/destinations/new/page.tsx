import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PageHeader } from "@/components/admin/page-header";
import { DestinationForm } from "@/components/admin/taxonomy/destination-form";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor } from "@/lib/auth/permissions";
import { getMediaPickerLabels } from "@/modules/media/media-labels";
import { slugPrefixes } from "@/modules/catalog/taxonomy/taxonomy-labels";
import { listParentOptions, newDestinationValues } from "@/modules/catalog/taxonomy/taxonomy.service";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Thêm điểm đến" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewDestinationPage({ searchParams }: Props) {
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  const shell = await getTranslations({ locale: "vi", namespace: "Admin.Shell" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("newDestination")}
        breadcrumbs={[{ label: t("destinations"), href: "/admin/destinations" }, { label: t("newDestination") }]}
        breadcrumbLabel={shell("breadcrumb")}
      />
      {/* Reads the `parent` query, so it renders in its own boundary (Cache Components). */}
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-3xl" aria-hidden="true" />}>
        <NewDestination searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewDestination({ searchParams }: Props) {
  const parentId = z.uuid().safeParse((await searchParams).parent).data;
  const [parents, pickerLabels] = await Promise.all([listParentOptions(), getMediaPickerLabels()]);
  const parent = parents.find((option) => option.id === parentId);
  return (
    <AdminMessages namespaces={["Taxonomy", "Content", "Form", "Shell"]}>
      <DestinationForm
        initial={newDestinationValues(parent)}
        hero={null}
        parents={parents}
        prefixes={slugPrefixes("destination")}
        pickerLabels={pickerLabels}
      />
    </AdminMessages>
  );
}
