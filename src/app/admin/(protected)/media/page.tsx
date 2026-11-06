import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FilterBar } from "@/components/admin/filter-bar";
import { MediaEditDialog } from "@/components/admin/media/media-edit-dialog";
import { MediaUploader } from "@/components/admin/media/media-uploader";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { listHref } from "@/lib/admin/list-params";
import { rolesFor } from "@/lib/auth/permissions";
import { listMediaSchema, type MediaItem } from "@/modules/media/media.schemas";
import { getUploaderLabels } from "@/modules/media/media-labels";
import { listMedia } from "@/modules/media/media.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Thư viện ảnh" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/media";

/** Media library (spec Phase 2 steps 5–6): upload, search, alt text, credit, delete when unused. */
export default async function MediaPage({ searchParams }: Props) {
  await requireAdminAccess(rolesFor("media.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader title={t("Media.title")} description={t("Media.description")} />
      <UploaderSection />
      <Suspense fallback={<GridSkeleton />}>
        <MediaList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function UploaderSection() {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Media" });
  return (
    <section aria-label={t("upload")}>
      <MediaUploader refreshOnDone labels={await getUploaderLabels()} />
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <Skeleton key={i} className="aspect-square" />
      ))}
    </div>
  );
}

async function MediaList({ searchParams }: Props) {
  const raw = await searchParams;
  const params = listMediaSchema.parse({
    q: Array.isArray(raw.q) ? raw.q[0] : raw.q,
    page: Array.isArray(raw.page) ? raw.page[0] : raw.page,
  });
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const { items, total, pageCount } = await listMedia(params);
  const query = { q: params.q || undefined };

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        action={BASE}
        search={{ label: t("Media.search"), value: params.q }}
        labels={{ apply: t("Table.apply"), clear: t("Table.clearFilters") }}
        active={Boolean(params.q)}
      />
      {items.length === 0 ? (
        <EmptyState headingLevel={2} title={params.q ? t("Table.emptyFiltered") : t("Media.empty")} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {items.map((item) => (
            <li key={item.id}>
              <MediaCard item={item} t={t} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-small text-muted-foreground">{t("Table.total", { count: total })}</p>
        <Pagination
          page={params.page}
          pageCount={pageCount}
          hrefFor={(page) => listHref(BASE, query, { page })}
          labels={{
            nav: t("Table.pagination"),
            previous: t("Table.previous"),
            next: t("Table.next"),
            page: (page) => t("Table.page", { page }),
          }}
        />
      </div>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"Admin">>>;

function MediaCard({ item, t }: { item: MediaItem; t: T }) {
  const name = item.alt.vi || item.alt.en || item.originalName || item.path.split("/").pop() || item.path;
  return (
    <MediaEditDialog
      item={item}
      labels={{
        edit: t("Media.edit"),
        editTitle: t("Media.editTitle"),
        altVi: t("Media.altVi"),
        altEn: t("Media.altEn"),
        altHint: t("Media.altHint"),
        credit: t("Media.credit"),
        save: t("Media.save"),
        saved: t("Media.saved"),
        delete: t("Media.delete"),
        deleteTitle: t("Media.deleteTitle"),
        deleteBody: t("Media.deleteBody"),
        deleted: t("Media.deleted"),
        deleteFailed: t.raw("Media.deleteFailed") as string,
        reasons: t.raw("Media.errors") as Record<string, string>,
        cancel: t("Form.cancel"),
        close: t("Shell.close"),
        actionFailed: t("Form.actionFailed"),
        small: t("Media.small"),
        smallHint: t("Media.smallHint"),
        dimensions: t("Media.dimensions", { width: item.width ?? 0, height: item.height ?? 0 }),
        fileSize: t("Media.fileSize", { size: (item.sizeBytes / 1024 / 1024).toFixed(1) }),
      }}
      trigger={
        <button
          type="button"
          aria-label={`${t("Media.edit")}: ${name}`}
          className="group flex w-full flex-col gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span
            className="block aspect-square w-full overflow-hidden bg-secondary bg-cover"
            style={item.blurDataUrl ? { backgroundImage: `url(${item.blurDataUrl})` } : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of an arbitrary upload */}
            <img
              src={item.url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          </span>
          <span className="line-clamp-2 text-small">{item.alt.vi || <span className="text-muted-foreground">{item.originalName ?? item.path}</span>}</span>
          <span className="flex flex-wrap gap-1">
            {!item.altComplete && <Badge variant="warning">{t("Media.altMissing")}</Badge>}
            {item.small && <Badge variant="outline">{t("Media.small")}</Badge>}
          </span>
        </button>
      }
    />
  );
}
