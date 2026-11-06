import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor } from "@/lib/auth/permissions";
import { listCancellationPolicies } from "@/modules/catalog/taxonomy/taxonomy.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Chính sách huỷ" };

/** Cancellation policies, admin only (spec Phase 2 step 10, ADR-016). */
export default async function CancellationPoliciesPage() {
  await requireAdminAccess(rolesFor("settings.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("policies")}
        description={t("policiesDescription")}
        actions={
          <Button asChild>
            <Link href="/admin/cancellation-policies/new">
              <Plus strokeWidth={1.5} aria-hidden="true" />
              {t("newPolicy")}
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
        <PolicyList />
      </Suspense>
    </div>
  );
}

async function PolicyList() {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  const policies = await listCancellationPolicies();
  if (policies.length === 0) return <EmptyState title={t("empty")} />;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {policies.map((policy) => (
        <li key={policy.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5" data-testid="policy-card">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/cancellation-policies/${policy.id}`}
              className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {policy.name}
            </Link>
            {policy.isDefault && <Badge variant="gold">{t("default")}</Badge>}
          </div>
          <p className="text-small text-muted-foreground">
            {t("version", { version: policy.version })} · {t("usedBy", { count: policy.tourCount })}
          </p>
          <table className="w-full text-small">
            <caption className="sr-only">{t("rules")}</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 font-medium">{t("minDaysBefore")}</th>
                <th scope="col" className="py-1 text-right font-medium">{t("refundPercent")}</th>
              </tr>
            </thead>
            <tbody>
              {policy.rules.map((rule) => (
                <tr key={rule.minDaysBefore} className="border-t border-border">
                  <td className="py-1">{rule.minDaysBefore}</td>
                  <td className="py-1 text-right">{rule.refundPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </li>
      ))}
    </ul>
  );
}
