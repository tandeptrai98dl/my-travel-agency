import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PageHeader } from "@/components/admin/page-header";
import { CancellationPolicyForm } from "@/components/admin/taxonomy/cancellation-policy-form";
import { DeleteEntityButton } from "@/components/admin/taxonomy/delete-entity-button";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor } from "@/lib/auth/permissions";
import { getCancellationPolicy } from "@/modules/catalog/taxonomy/taxonomy.service";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Sửa chính sách huỷ" };

type Props = { params: Promise<{ id: string }> };

export default async function EditCancellationPolicyPage({ params }: Props) {
  await requireAdminAccess(rolesFor("settings.manage"));
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-3xl" aria-hidden="true" />}>
        <EditPolicy params={params} />
      </Suspense>
    </div>
  );
}

async function EditPolicy({ params }: Props) {
  const id = z.uuid().safeParse((await params).id).data;
  if (!id) notFound();
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  const shell = await getTranslations({ locale: "vi", namespace: "Admin.Shell" });
  const policy = await getCancellationPolicy(id);
  if (!policy) notFound();
  return (
    <>
      <PageHeader
        title={policy.values.name}
        description={t("version", { version: policy.version })}
        breadcrumbs={[{ label: t("policies"), href: "/admin/cancellation-policies" }, { label: policy.values.name }]}
        breadcrumbLabel={shell("breadcrumb")}
      />
      <AdminMessages namespaces={["Taxonomy", "Form", "Shell"]}>
        <CancellationPolicyForm
          initial={policy.values}
          deleteAction={
            policy.tourCount === 0 ? (
              <DeleteEntityButton kind="cancellationPolicy" id={id} listHref="/admin/cancellation-policies" />
            ) : undefined
          }
        />
      </AdminMessages>
    </>
  );
}
