import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { InquiryAssignForm, InquiryNoteForm, InquiryStatusForm } from "@/components/admin/inquiries/inquiry-action-forms";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { type CurrentUser } from "@/lib/auth/get-user";
import { can, rolesFor } from "@/lib/auth/permissions";
import { INQUIRY_SOURCES, INQUIRY_STATUSES, type InquiryActivity, type InquiryDetail, responseTime } from "@/modules/inquiry/inquiry-admin.schemas";
import { getInquiry, inquiryAssignees, managesAllInquiries } from "@/modules/inquiry/inquiry-admin.service";

import { requireAdminAccess } from "../../../admin-gate";
import { adminDateTime } from "../../bookings/format";
import { durationText } from "../duration";

export const metadata: Metadata = { title: "Chi tiết yêu cầu tư vấn" };

type Props = { params: Promise<{ id: string }> };
type T = Awaited<ReturnType<typeof getTranslations<"Admin.Inquiries">>>;

/** One inquiry: the request, contact, trip, message, consent, notes, history and the role's actions. */
export default async function InquiryDetailPage({ params }: Props) {
  await requireAdminAccess(rolesFor("inquiries.read"));
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" aria-hidden="true" />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <h2 id={id} className="font-serif text-h3 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

const sourceKey = (source: string | null) => ((INQUIRY_SOURCES as readonly string[]).includes(source ?? "") ? (source as (typeof INQUIRY_SOURCES)[number]) : "other");
const statusLabel = (t: T, value: unknown) =>
  typeof value === "string" && (INQUIRY_STATUSES as readonly string[]).includes(value) ? t(`statuses.${value as (typeof INQUIRY_STATUSES)[number]}`) : "—";
const optional = (t: T, key: string, value: string | null) => (value && t.has(key) ? t(key as never) : value);

/** "03/2027" in the admin. */
function monthText(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  return match ? `${match[2]}/${match[1]}` : month;
}

async function Detail({ params }: Props) {
  const id = z.guid().safeParse((await params).id).data;
  if (!id) notFound();
  const user = await requireAdminAccess(rolesFor("inquiries.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Inquiries" });
  const inquiry = await getInquiry(id);
  if (!inquiry) notFound();
  return (
    <>
      <PageHeader
        title={inquiry.code}
        description={`${t(`sources.${sourceKey(inquiry.source)}`)} · ${inquiry.name}`}
        breadcrumbs={[{ label: t("title"), href: "/admin/inquiries" }, { label: inquiry.code }]}
        breadcrumbLabel={(await getTranslations({ locale: "vi", namespace: "Admin.Shell" }))("breadcrumb")}
        actions={<StatusBadge kind="inquiry" status={inquiry.status} label={t(`statuses.${inquiry.status}`)} />}
      />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Summary inquiry={inquiry} t={t} />
          <Trip inquiry={inquiry} t={t} />
          <Message inquiry={inquiry} t={t} />
          <Notes inquiry={inquiry} t={t} />
          <History inquiry={inquiry} t={t} />
        </div>
        <Actions inquiry={inquiry} user={user} t={t} />
      </div>
    </>
  );
}

async function Summary({ inquiry, t }: { inquiry: InquiryDetail; t: T }) {
  const format = await getFormatter({ locale: "vi" });
  const answered = responseTime(inquiry.createdAt, inquiry.firstRespondedAt);
  return (
    <Section id="inquiry-summary" title={t("Detail.summary")}>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t("source")}>{t(`sources.${sourceKey(inquiry.source)}`)}</Fact>
        <Fact label={t("receivedAt")}>
          <time dateTime={inquiry.createdAt}>{adminDateTime(format, inquiry.createdAt)}</time>
        </Fact>
        <Fact label={t("Detail.firstResponse")}>
          {inquiry.firstRespondedAt ? <time dateTime={inquiry.firstRespondedAt}>{adminDateTime(format, inquiry.firstRespondedAt)}</time> : t("Detail.notAnswered")}
        </Fact>
        <Fact label={t("Detail.responseTime")}>{answered === null ? t("Detail.none") : durationText(t, answered)}</Fact>
        <Fact label={t("owner")}>{inquiry.owner ?? t("unassigned")}</Fact>
        <Fact label={t("Detail.language")}>{t(`Detail.languages.${inquiry.locale}`)}</Fact>
      </dl>
      <h3 className="font-sans text-h4 font-semibold">{t("Detail.contactTitle")}</h3>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t("Detail.name")}>{inquiry.name}</Fact>
        <Fact label={t("Detail.email")}>
          <a href={`mailto:${inquiry.email}`} className="break-all underline underline-offset-4">
            {inquiry.email}
          </a>
        </Fact>
        <Fact label={t("Detail.phone")}>{inquiry.phone ?? t("Detail.none")}</Fact>
        {inquiry.preferredContact && <Fact label={t("Detail.channel")}>{optional(t, `Detail.channels.${inquiry.preferredContact}`, inquiry.preferredContact)}</Fact>}
        {inquiry.country && <Fact label={t("Detail.country")}>{inquiry.country}</Fact>}
        {inquiry.companyName && <Fact label={t("Detail.company")}>{inquiry.companyName}</Fact>}
      </dl>
      <h3 className="font-sans text-h4 font-semibold">{t("Detail.consentTitle")}</h3>
      {inquiry.consents.length === 0 ? (
        <p className="text-small text-muted-foreground">{t("Detail.noConsent")}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-small">
          {inquiry.consents.map((consent) => (
            <li key={`${consent.purpose}-${consent.createdAt}`}>
              {t("Detail.consentRow", { purpose: optional(t, `Detail.purposes.${consent.purpose}`, consent.purpose) ?? consent.purpose, version: consent.version })} ·{" "}
              <time dateTime={consent.createdAt}>{adminDateTime(format, consent.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Trip({ inquiry, t }: { inquiry: InquiryDetail; t: T }) {
  const destinations = [...inquiry.destinations];
  return (
    <Section id="inquiry-trip" title={t("Detail.tripTitle")}>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t("Detail.tourLabel")}>
          {inquiry.tour ? (
            <>
              <code>{inquiry.tour.code}</code> {inquiry.tour.title} ({t(`Detail.tourTypes.${inquiry.tour.type}`)})
            </>
          ) : (
            t("Detail.none")
          )}
        </Fact>
        <Fact label={t("Detail.destinations")}>{destinations.length > 0 ? destinations.join(", ") : t("Detail.none")}</Fact>
        {inquiry.destinationsOther && <Fact label={t("Detail.destinationsOther")}>{inquiry.destinationsOther}</Fact>}
        <Fact label={t("Detail.style")}>{inquiry.travelStyle ?? t("Detail.none")}</Fact>
        <Fact label={t("Detail.month")}>
          {inquiry.travelMonth
            ? inquiry.flexibleDates
              ? t("Detail.flexible", { month: monthText(inquiry.travelMonth) })
              : monthText(inquiry.travelMonth)
            : t("Detail.none")}
        </Fact>
        <Fact label={t("Detail.durationLabel")}>
          {inquiry.durationDays ? t("Detail.durationDays", { count: inquiry.durationDays }) : t("Detail.none")}
        </Fact>
        <Fact label={t("Detail.partyLabel")}>
          {inquiry.adults ? t("Detail.party", { adults: inquiry.adults, children: inquiry.children }) : t("Detail.none")}
        </Fact>
        <Fact label={t("Detail.budget")}>{inquiry.budget ? optional(t, `Detail.budgets.${inquiry.budget}`, inquiry.budget) : t("Detail.none")}</Fact>
      </dl>
    </Section>
  );
}

function Message({ inquiry, t }: { inquiry: InquiryDetail; t: T }) {
  const utm = Object.entries(inquiry.utm);
  return (
    <Section id="inquiry-message" title={t("Detail.messageTitle")}>
      {inquiry.message ? <p className="whitespace-pre-wrap break-words">{inquiry.message}</p> : <p className="text-small text-muted-foreground">{t("Detail.noMessage")}</p>}
      {utm.length > 0 && (
        <p className="text-small text-muted-foreground">
          {t("Detail.campaign")}: {utm.map(([key, value]) => `${key}=${value}`).join(" · ")}
        </p>
      )}
    </Section>
  );
}

async function Notes({ inquiry, t }: { inquiry: InquiryDetail; t: T }) {
  const format = await getFormatter({ locale: "vi" });
  return (
    <Section id="inquiry-notes" title={t("Detail.notesTitle")}>
      {inquiry.notes.length === 0 ? (
        <p className="text-small text-muted-foreground">{t("Detail.noNotes")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border" data-testid="inquiry-notes">
          {inquiry.notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-1 py-3 text-small">
              <p className="whitespace-pre-wrap break-words text-body">{note.body}</p>
              <span className="text-muted-foreground">
                {note.author ?? t("Detail.system")} · <time dateTime={note.createdAt}>{adminDateTime(format, note.createdAt)}</time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function activityText(t: T, item: InquiryActivity): string {
  const owner = (value: unknown) => (typeof value === "string" ? value : t("unassigned"));
  switch (item.action) {
    case "inquiries.assign":
      return t("Detail.activity.assign", { from: owner(item.before.assigned_to), to: owner(item.after.assigned_to) });
    case "inquiries.status":
      return t("Detail.activity.status", { from: statusLabel(t, item.before.status), to: statusLabel(t, item.after.status) });
    case "inquiries.note":
      return item.contacted ? t("Detail.activity.noteContacted") : t("Detail.activity.note");
    case "inquiries.quote":
      return t("Detail.activity.quote");
    default:
      return t("Detail.activity.other");
  }
}

async function History({ inquiry, t }: { inquiry: InquiryDetail; t: T }) {
  const format = await getFormatter({ locale: "vi" });
  return (
    <Section id="inquiry-history" title={t("Detail.activityTitle")}>
      {inquiry.activity.length === 0 ? (
        <p className="text-small text-muted-foreground">{t("Detail.noActivity")}</p>
      ) : (
        <ol className="flex flex-col gap-4 border-l border-border pl-5" data-testid="inquiry-history">
          {inquiry.activity.map((item, index) => (
            <li key={`${item.createdAt}-${index}`} className="relative flex flex-col gap-1 text-small" data-action={item.action}>
              <span aria-hidden="true" className="absolute -left-[1.6rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
              <span className="font-medium">{activityText(t, item)}</span>
              <span className="text-muted-foreground">
                <time dateTime={item.createdAt}>{adminDateTime(format, item.createdAt)}</time> · {item.actor ?? t("Detail.system")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

async function Actions({ inquiry, user, t }: { inquiry: InquiryDetail; user: CurrentUser; t: T }) {
  const manager = managesAllInquiries(user.role);
  const works = can(user.role, "inquiries.edit") && (manager || inquiry.ownerId === null || inquiry.ownerId === user.id);
  const panels: React.ReactNode[] = [];
  if (works) {
    if (manager) {
      const assignees = await inquiryAssignees();
      panels.push(
        <InquiryAssignForm key="assign" inquiryId={inquiry.id} ownerId={inquiry.ownerId} ownerName={inquiry.owner} selfId={user.id} assignees={assignees} manager />,
      );
    } else if (inquiry.ownerId === null) {
      panels.push(<InquiryAssignForm key="assign" inquiryId={inquiry.id} ownerId={null} ownerName={null} selfId={user.id} assignees={[]} manager={false} />);
    }
    panels.push(<InquiryNoteForm key="note" inquiryId={inquiry.id} />);
    panels.push(<InquiryStatusForm key="status" inquiryId={inquiry.id} current={inquiry.status} />);
  }
  const quote = inquiry.booking ? (
    <div className="flex flex-col gap-2">
      <h3 className="font-sans text-h4 font-semibold">{t("Detail.bookingTitle")}</h3>
      <Link href={`/admin/bookings/${inquiry.booking.id}`} className="underline underline-offset-4">
        {t("Detail.bookingLink", { code: inquiry.booking.code })}
      </Link>
    </div>
  ) : works && can(user.role, "bookings.edit") ? (
    <div className="flex flex-col gap-2">
      <h3 className="font-sans text-h4 font-semibold">{t("Detail.bookingTitle")}</h3>
      <Link href={`/admin/bookings/new?inquiry=${encodeURIComponent(inquiry.code)}`} className={buttonVariants({ variant: "gold" })}>
        {t("Detail.createQuote")}
      </Link>
      <p className="text-small text-muted-foreground">{inquiry.tour?.type === "private" ? t("Detail.quoteHint") : t("Detail.quoteNeedsPrivate")}</p>
    </div>
  ) : null;
  if (quote) panels.unshift(<div key="quote">{quote}</div>);
  return (
    <aside aria-labelledby="inquiry-actions" className="flex flex-col gap-6 self-start rounded-lg border border-border bg-card p-5">
      <h2 id="inquiry-actions" className="font-serif text-h3 font-semibold">
        {t("Detail.actionsTitle")}
      </h2>
      {!works && <p className="text-small text-muted-foreground">{t("Detail.readOnly")}</p>}
      {panels.length > 0 && (
        <AdminMessages namespaces={["Inquiries"]}>
          {panels.map((panel, index) => (
            // Keyed by the panel, not its position: after "take" the assign panel goes, and an
            // index key would remount the note and status forms during the refresh (losing input).
            <div key={(panel as React.ReactElement).key ?? index} className={index > 0 ? "border-t border-border pt-6" : undefined}>
              {panel}
            </div>
          ))}
        </AdminMessages>
      )}
    </aside>
  );
}
