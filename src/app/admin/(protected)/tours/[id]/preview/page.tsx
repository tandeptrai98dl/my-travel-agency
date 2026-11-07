import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { TourDetailView } from "@/components/tour/tour-detail-view";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor } from "@/lib/auth/permissions";
import { getTourPreview, getTourPreviewDepartures } from "@/modules/catalog/public/tour-public.service";
import { onlineBookingAvailable } from "@/modules/catalog/public/online-booking.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

import { requireAdminAccess } from "../../../../admin-gate";

export const metadata: Metadata = { title: "Xem trước tour", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ locale?: string }> };

/**
 * Staff preview of a tour as its public page shows it, drafts included (Phase 3 spec decision
 * 17): the staff session reads it (RLS), nothing is cached, and the page is never indexed.
 */
export default function TourPreviewPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="m-8 h-96" aria-hidden="true" />}>
      <Preview {...props} />
    </Suspense>
  );
}

async function Preview({ params, searchParams }: Props) {
  await requireAdminAccess(rolesFor("tours.read"));
  const id = z.uuid().safeParse((await params).id).data;
  const locale = (await searchParams).locale === "en" ? "en" : "vi";
  if (!id) notFound();
  const [tour, settings, onlineBooking] = await Promise.all([getTourPreview(id, locale), getPublicSettings(), onlineBookingAvailable()]);
  if (!tour) notFound();
  return (
    <div lang={locale} className="bg-background pb-16">
      <TourDetailView
        locale={locale}
        tour={tour}
        related={[]}
        reviews={{ count: 0, average: null, latest: [] }}
        contact={{ phone: settings.contact?.phone ?? null, email: settings.contact?.email ?? null }}
        onlineBooking={onlineBooking}
        loadDepartures={getTourPreviewDepartures}
        preview
      />
    </div>
  );
}
