import { Plus, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { LocaleBadges } from "@/components/admin/taxonomy/locale-badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { currentQuery, listHref, parseListParams } from "@/lib/admin/list-params";
import { rolesFor } from "@/lib/auth/permissions";
import { getLocaleBadgeLabels } from "@/modules/catalog/taxonomy/taxonomy-labels";
import { POST_SORTS, postListFilters, POSTS_PAGE_SIZE } from "@/modules/content/content.schemas";
import { listCategories, listPosts, type PostListItem } from "@/modules/content/content.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Tạp chí" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/journal";
const DEFAULTS = { sort: "updated_at", dir: "desc" } as const;

/** Journal articles (spec Phase 2 step 18): editors and admins. */
export default async function JournalPage({ searchParams }: Props) {
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Content" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("journal")}
        description={t("journalDescription")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`${BASE}/categories`}>
                <Tags strokeWidth={1.5} aria-hidden="true" />
                {t("categories")}
              </Link>
            </Button>
            <Button asChild>
              <Link href={`${BASE}/new`}>
                <Plus strokeWidth={1.5} aria-hidden="true" />
                {t("newPost")}
              </Link>
            </Button>
          </div>
        }
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
        <PostList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PostList({ searchParams }: Props) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const params = parseListParams(await searchParams, {
    sortable: POST_SORTS,
    defaultSort: DEFAULTS.sort,
    defaultDir: DEFAULTS.dir,
    pageSize: POSTS_PAGE_SIZE,
    filters: postListFilters,
  });
  const query = currentQuery(params, DEFAULTS);
  const [{ items, total, pageCount }, categories, badgeLabels] = await Promise.all([
    listPosts(params),
    listCategories(),
    getLocaleBadgeLabels(),
  ]);
  const date = (value: string | null) =>
    value ? (
      <time dateTime={value}>{format.dateTime(new Date(value), { day: "2-digit", month: "2-digit", year: "numeric" })}</time>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  const columns: DataTableColumn<PostListItem>[] = [
    {
      key: "title",
      header: t("Content.columns.title"),
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <Link
            href={`${BASE}/${row.id}`}
            className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {row.title}
          </Link>
          {row.categoryName && <span className="text-small text-muted-foreground">{row.categoryName}</span>}
        </div>
      ),
    },
    {
      key: "status",
      header: t("Content.columns.status"),
      cell: (row) => <StatusBadge kind="publish" status={row.status} label={t(`Taxonomy.statuses.${row.status}`)} />,
    },
    {
      key: "languages",
      header: t("Content.columns.languages"),
      cell: (row) => <LocaleBadges locales={row.locales} labels={badgeLabels} />,
    },
    { key: "published", header: t("Content.columns.published"), sortKey: "published_at", className: "whitespace-nowrap", cell: (row) => date(row.publishedAt) },
    { key: "updated", header: t("Content.columns.updated"), sortKey: "updated_at", className: "whitespace-nowrap", cell: (row) => date(row.updatedAt) },
  ];

  const filtered = Boolean(params.q || Object.keys(params.filters).length);
  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        action={BASE}
        search={{ label: t("Content.searchLabel"), value: params.q }}
        selects={[
          {
            name: "status",
            label: t("Content.columns.status"),
            value: params.filters.status,
            allLabel: t("Content.allStatuses"),
            options: postListFilters.status.map((value) => ({ value, label: t(`Taxonomy.statuses.${value}`) })),
          },
          {
            name: "category",
            label: t("Content.category"),
            value: params.filters.category,
            allLabel: t("Content.allCategories"),
            options: categories.map((category) => ({ value: category.id, label: category.name })),
          },
        ]}
        hidden={{ sort: query.sort, dir: query.dir }}
        labels={{ apply: t("Table.apply"), clear: t("Table.clearFilters") }}
        active={filtered}
      />
      <DataTable
        rows={items}
        columns={columns}
        rowKey={(row) => row.id}
        sort={{ key: params.sort, dir: params.dir }}
        page={params.page}
        pageCount={pageCount}
        hrefFor={(overrides) => listHref(BASE, query, overrides)}
        outOfRange={
          items.length === 0 && total > 0
            ? { message: t("Table.outOfRange"), lastPageLabel: t("Table.lastPage", { page: pageCount }) }
            : undefined
        }
        labels={{
          caption: t("Content.journal"),
          empty: filtered ? t("Table.emptyFiltered") : t("Table.empty"),
          sortAscending: t("Table.sortAscending"),
          sortDescending: t("Table.sortDescending"),
          pagination: {
            nav: t("Table.pagination"),
            previous: t("Table.previous"),
            next: t("Table.next"),
            page: (page) => t("Table.page", { page }),
          },
          total: t("Table.total", { count: total }),
        }}
      />
    </div>
  );
}
