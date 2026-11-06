import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { LocaleBadges } from "@/components/admin/taxonomy/locale-badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor } from "@/lib/auth/permissions";
import { getLocaleBadgeLabels } from "@/modules/catalog/taxonomy/taxonomy-labels";
import { listCategories } from "@/modules/content/content.service";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Chủ đề tạp chí" };

/** Journal topics (spec Phase 2 step 18). */
export default async function CategoriesPage() {
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("Content.categories")}
        description={t("Content.categoriesDescription")}
        breadcrumbs={[{ label: t("Content.journal"), href: "/admin/journal" }, { label: t("Content.categories") }]}
        breadcrumbLabel={t("Shell.breadcrumb")}
        actions={
          <Button asChild>
            <Link href="/admin/journal/categories/new">
              <Plus strokeWidth={1.5} aria-hidden="true" />
              {t("Content.newCategory")}
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-48 w-full" aria-hidden="true" />}>
        <CategoryList />
      </Suspense>
    </div>
  );
}

async function CategoryList() {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Content" });
  const [categories, badgeLabels] = await Promise.all([listCategories(), getLocaleBadgeLabels()]);
  if (categories.length === 0) return <EmptyState title={t("categoriesEmpty")} />;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card" aria-label={t("categories")}>
      {categories.map((category) => (
        <li key={category.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex min-w-48 flex-1 flex-col">
            <Link
              href={`/admin/journal/categories/${category.id}`}
              className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {category.name}
            </Link>
            <span className="text-small text-muted-foreground">
              {t("sortOrder")} {category.sortOrder}
            </span>
          </div>
          <LocaleBadges locales={category.locales} labels={badgeLabels} />
        </li>
      ))}
    </ul>
  );
}
