import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { formatVnd } from "@/lib/money";
import type { Dashboard } from "@/modules/operations/dashboard.schemas";

type Stat = { id: string; label: string; value: string; href?: string; alert?: boolean };

/**
 * The dashboard figures of `/admin` (spec Phase 5 decision 13), one section per part of the
 * role's work, as `admin_dashboard()` returned them. Each figure links to the page where it is
 * worked when there is one.
 */
export async function DashboardFigures({ data }: { data: Dashboard }) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Operations.Dashboard" });
  const format = await getFormatter({ locale: "vi" });
  const number = (value: number) => format.number(value);
  const minutes = (value: number | null) => {
    if (value === null) return t("noData");
    const hours = Math.floor(value / 60);
    return hours > 0 ? t("hoursMinutes", { hours, minutes: value % 60 }) : t("minutes", { minutes: value });
  };

  const sections: { id: string; title: string; description?: string; stats: Stat[] }[] = [];
  if (data.sales) {
    const team = data.sales.scope === "team";
    sections.push({
      id: "sales",
      title: t("sales.title"),
      description: team ? t("sales.team") : t("sales.own"),
      stats: [
        { id: "new-bookings", label: t("sales.newBookings"), value: number(data.sales.new_bookings), href: "/admin/bookings" },
        {
          id: "open-inquiries",
          label: t("sales.openInquiries"),
          value: number(data.sales.open_inquiries),
          href: team ? "/admin/inquiries" : "/admin/inquiries?owner=mine",
        },
        {
          id: "unassigned",
          label: t("sales.unassigned"),
          value: number(data.sales.unassigned_inquiries),
          href: "/admin/inquiries?owner=unassigned",
          alert: data.sales.unassigned_inquiries > 0,
        },
        { id: "quotes", label: t("sales.quotes"), value: number(data.sales.quotes_awaiting_payment), href: "/admin/bookings?status=quoted" },
        { id: "first-response", label: t("sales.firstResponse"), value: minutes(data.sales.median_first_response_minutes) },
      ],
    });
  }
  if (data.operations) {
    sections.push({
      id: "operations",
      title: t("operations.title"),
      stats: [
        {
          id: "below-minimum",
          label: t("operations.belowMinimum"),
          value: number(data.operations.below_minimum),
          href: "/admin/departures",
          alert: data.operations.below_minimum > 0,
        },
        {
          id: "missing-travellers",
          label: t("operations.missingTravellers"),
          value: number(data.operations.missing_travellers),
          href: "/admin/bookings?status=confirmed",
          alert: data.operations.missing_travellers > 0,
        },
      ],
    });
  }
  if (data.finance) {
    sections.push({
      id: "finance",
      title: t("finance.title"),
      stats: [
        { id: "revenue", label: t("finance.revenue"), value: formatVnd(data.finance.revenue_month, "vi"), href: "/admin/payments" },
        { id: "expiring", label: t("finance.expiring"), value: number(data.finance.payments_expiring), href: "/admin/payments?status=pending" },
        {
          id: "unmatched",
          label: t("finance.unmatched"),
          value: number(data.finance.unmatched_transfers),
          href: "/admin/payments#unmatched",
          alert: data.finance.unmatched_transfers > 0,
        },
        {
          id: "money-attention",
          label: t("finance.moneyAttention"),
          value: number(data.finance.money_attention),
          href: "/admin/bookings/attention",
          alert: data.finance.money_attention > 0,
        },
      ],
    });
  }
  if (data.content) {
    sections.push({
      id: "content",
      title: t("content.title"),
      stats: [
        { id: "drafts", label: t("content.drafts"), value: number(data.content.drafts), href: "/admin/tours?status=draft" },
        { id: "translations", label: t("content.missingTranslations"), value: number(data.content.missing_translations) },
        { id: "alt", label: t("content.missingAlt"), value: number(data.content.missing_alt), href: "/admin/media", alert: data.content.missing_alt > 0 },
      ],
    });
  }
  if (data.admin) {
    sections.push({
      id: "admin",
      title: t("admin.title"),
      stats: [
        {
          id: "deletion-requests",
          label: t("admin.deletionRequests"),
          value: number(data.admin.deletion_requests),
          href: "/admin/customers#deletion-requests",
          alert: data.admin.deletion_requests > 0,
        },
      ],
    });
  }

  return (
    <section aria-labelledby="dashboard-figures-title" className="flex flex-col gap-6" data-testid="dashboard-figures">
      <h2 id="dashboard-figures-title" className="font-serif text-h3 font-semibold lg:text-h3-lg">
        {t("title")}
      </h2>
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-3" data-testid={`dashboard-${section.id}`}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-eyebrow font-semibold uppercase text-muted-foreground">{section.title}</h3>
            {section.description && <p className="text-small text-muted-foreground">{section.description}</p>}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.stats.map((stat) => (
              <li key={stat.id}>
                <StatCard stat={stat} />
              </li>
            ))}
          </ul>
          {section.id === "operations" && data.operations && <UpcomingDepartures departures={data.operations.departures} />}
        </div>
      ))}
    </section>
  );
}

function StatCard({ stat }: { stat: Stat }) {
  const body = (
    <>
      <span className="text-small text-muted-foreground">{stat.label}</span>
      <span className="flex items-center justify-between gap-2">
        <span className="font-serif text-h3 font-semibold leading-tight" data-testid={`stat-${stat.id}`}>
          {stat.value}
        </span>
        {stat.href && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />}
      </span>
    </>
  );
  const className = `flex h-full flex-col gap-1 rounded-lg border bg-card p-4 ${stat.alert ? "border-warning/60" : "border-border"}`;
  if (!stat.href) return <div className={className}>{body}</div>;
  return (
    <Link
      href={stat.href}
      className={`${className} transition-colors duration-200 hover:border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
    >
      {body}
    </Link>
  );
}

async function UpcomingDepartures({ departures }: { departures: NonNullable<Dashboard["operations"]>["departures"] }) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Operations.Dashboard.operations" });
  const format = await getFormatter({ locale: "vi" });
  if (departures.length === 0) return <p className="text-small text-muted-foreground">{t("noDepartures")}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[36rem] text-left text-small">
        <caption className="px-4 pt-4 text-left font-medium">{t("upcoming")}</caption>
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th scope="col" className="px-4 py-3 font-medium">{t("tour")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("date")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("seats")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("confirmed")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("travellers")}</th>
          </tr>
        </thead>
        <tbody>
          {departures.map((departure) => {
            const below = departure.min_pax !== null && departure.confirmed < departure.min_pax;
            return (
              <tr key={departure.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/departures/${departure.id}`} className="font-medium underline underline-offset-4">
                    {departure.tour_code}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <time dateTime={departure.start_date}>
                    {format.dateTime(new Date(`${departure.start_date}T00:00:00`), { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </time>
                </td>
                <td className="px-4 py-3">{t("seatsValue", { reserved: departure.seats_reserved, capacity: departure.capacity })}</td>
                <td className={`px-4 py-3 ${below ? "font-medium text-warning" : ""}`}>
                  {departure.min_pax === null
                    ? departure.confirmed
                    : t("confirmedValue", { confirmed: departure.confirmed, min: departure.min_pax })}
                </td>
                <td className={`px-4 py-3 ${departure.travellers < departure.party ? "font-medium text-warning" : ""}`}>
                  {t("travellersValue", { filled: departure.travellers, party: departure.party })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
