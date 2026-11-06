import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PageHeader } from "@/components/admin/page-header";
import { TravelStyleForm } from "@/components/admin/taxonomy/travel-style-form";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor } from "@/lib/auth/permissions";
import { getMediaPickerLabels } from "@/modules/media/media-labels";
import { slugPrefixes } from "@/modules/catalog/taxonomy/taxonomy-labels";
import { newTravelStyleValues } from "@/modules/catalog/taxonomy/taxonomy.service";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Thêm phong cách" };

export default async function NewTravelStylePage() {
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  const shell = await getTranslations({ locale: "vi", namespace: "Admin.Shell" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("newStyle")}
        breadcrumbs={[{ label: t("travelStyles"), href: "/admin/travel-styles" }, { label: t("newStyle") }]}
        breadcrumbLabel={shell("breadcrumb")}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-3xl" aria-hidden="true" />}>
        <NewTravelStyle />
      </Suspense>
    </div>
  );
}

async function NewTravelStyle() {
  return (
    <AdminMessages namespaces={["Taxonomy", "Form", "Shell"]}>
      <TravelStyleForm
        initial={newTravelStyleValues()}
        hero={null}
        prefixes={slugPrefixes("travelStyle")}
        pickerLabels={await getMediaPickerLabels()}
      />
    </AdminMessages>
  );
}
