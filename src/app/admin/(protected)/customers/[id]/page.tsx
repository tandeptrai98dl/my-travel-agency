import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { CustomerNoteForm, ExportCustomerButton, FinishDeletionForm } from "@/components/admin/customers/customer-action-forms";
import { CustomerStateBadge } from "@/components/admin/customers/customer-state-badge";
import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, rolesFor } from "@/lib/auth/permissions";
import { formatVnd } from "@/lib/money";
import { getCustomer } from "@/modules/account/customers-admin.service";

import { requireAdminAccess } from "../../../admin-gate";
import { adminDate, adminDateTime } from "../../bookings/format";

export const metadata: Metadata = { title: "Chi tiết khách hàng" };

type Props = { params: Promise<{ id: string }> };

/**
 * One customer (spec Phase 5 decision 16): profile, bookings, inquiries, notes (sales roles and
 * admin write; operators read), consent history and the deletion request. The data export and
 * finishing a deletion are for an MFA-verified admin.
 */
export default async function CustomerDetailPage({ params }: Props) {
  await requireAdminAccess(rolesFor("customers.read"));
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
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5" data-testid={id}>
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

async function Detail({ params }: Props) {
  const id = z.guid().safeParse((await params).id).data;
  if (!id) notFound();
  const user = await requireAdminAccess(rolesFor("customers.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Operations.Customers" });
  const tb = await getTranslations({ locale: "vi", namespace: "Admin.Bookings" });
  const ti = await getTranslations({ locale: "vi", namespace: "Admin.Inquiries" });
  const format = await getFormatter({ locale: "vi" });
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const admin = can(user.role, "customers.delete_data");
  const title = customer.fullName || customer.email;
  const none = <span className="text-muted-foreground">—</span>;

  return (
    <>
      <PageHeader
        title={title}
        description={t("Detail.description")}
        breadcrumbs={[{ label: t("title"), href: "/admin/customers" }, { label: title }]}
        breadcrumbLabel={t("Detail.breadcrumb")}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <CustomerStateBadge state={customer.state} label={t(`states.${customer.state}`)} />
            {admin && (
              <AdminMessages namespaces={["Operations"]}>
                <ExportCustomerButton customerId={customer.id} />
              </AdminMessages>
            )}
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section id="customer-profile" title={t("Detail.profile")}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Fact label={t("email")}>
              <span className="break-all">{customer.email}</span>
            </Fact>
            <Fact label={t("phone")}>{customer.phone ?? none}</Fact>
            <Fact label={t("Detail.country")}>{customer.country ?? none}</Fact>
            <Fact label={t("Detail.language")}>{t(`Detail.languages.${customer.locale === "en" ? "en" : "vi"}`)}</Fact>
            <Fact label={t("Detail.marketing")}>{customer.marketingConsent ? t("Detail.yes") : t("Detail.no")}</Fact>
            <Fact label={t("createdAt")}>
              <time dateTime={customer.createdAt}>{adminDateTime(format, customer.createdAt)}</time>
            </Fact>
          </dl>
        </Section>

        <Section id="customer-deletion" title={t("Deletion.title")}>
          {customer.state === "active" ? (
            <p className="text-small text-muted-foreground">{t("Deletion.notRequested")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {customer.requestedAt && (
                <p className="text-small">{t("Deletion.requestedAt", { date: adminDateTime(format, customer.requestedAt) })}</p>
              )}
              {customer.state === "deleted" && !customer.deletion && <p className="text-small">{t("Deletion.completed")}</p>}
              {admin && customer.deletion && (
                <>
                  <p className="text-small" data-testid="deletion-state">
                    {customer.deletion.profileDeleted
                      ? t("Deletion.authPending")
                      : customer.deletion.blockers.length > 0
                        ? t("Deletion.blockedBy", { reasons: customer.deletion.blockers.map((reason) => t(`blockers.${reason as "balance_due"}`)).join(", ") })
                        : t("Deletion.ready")}
                  </p>
                  {(customer.deletion.profileDeleted || customer.deletion.blockers.length === 0) && (
                    <AdminMessages namespaces={["Operations"]}>
                      <FinishDeletionForm key="finish-deletion" customerId={customer.id} retry={customer.deletion.profileDeleted} />
                    </AdminMessages>
                  )}
                </>
              )}
              {!admin && customer.state === "requested" && <p className="text-small text-muted-foreground">{t("Deletion.adminOnly")}</p>}
            </div>
          )}
        </Section>
      </div>

      <Section id="customer-bookings" title={t("Detail.bookings")}>
        {customer.bookings.length === 0 ? (
          <p className="text-small text-muted-foreground">{t("Detail.noBookings")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {customer.bookings.map((booking) => (
              <li key={booking.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/bookings/${booking.id}`} className="font-medium underline underline-offset-4">
                    {booking.code}
                  </Link>
                  <code className="text-small text-muted-foreground">{booking.tourCode}</code>
                  <span className="text-small">{adminDate(format, booking.startDate)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-small">
                  <StatusBadge kind="booking" status={booking.status} label={tb(`statuses.${booking.status}`)} />
                  {formatVnd(booking.amountPaid, "vi")} / {formatVnd(booking.total, "vi")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {can(user.role, "inquiries.read") && (
        <Section id="customer-inquiries" title={t("Detail.inquiries")}>
          {customer.inquiries.length === 0 ? (
            <p className="text-small text-muted-foreground">{t("Detail.noInquiries")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {customer.inquiries.map((inquiry) => (
                <li key={inquiry.id} className="flex flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0">
                  <Link href={`/admin/inquiries/${inquiry.id}`} className="font-medium underline underline-offset-4">
                    {inquiry.code}
                  </Link>
                  <StatusBadge kind="inquiry" status={inquiry.status} label={ti(`statuses.${inquiry.status}`)} />
                  <time dateTime={inquiry.createdAt} className="text-small text-muted-foreground">
                    {adminDateTime(format, inquiry.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {customer.notes && (
        <Section id="customer-notes" title={t("Detail.notes")}>
          {customer.notes.length === 0 ? (
            <p className="text-small text-muted-foreground">{t("Detail.noNotes")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {customer.notes.map((note) => (
                <li key={note.id} className="flex flex-col gap-1 border-l-2 border-border pl-3">
                  <p className="whitespace-pre-line">{note.body}</p>
                  <p className="text-small text-muted-foreground">
                    {note.author} · <time dateTime={note.createdAt}>{adminDateTime(format, note.createdAt)}</time>
                  </p>
                </li>
              ))}
            </ul>
          )}
          {can(user.role, "customers.notes") && customer.state !== "deleted" && (
            <AdminMessages namespaces={["Operations"]}>
              <CustomerNoteForm key="customer-note" customerId={customer.id} />
            </AdminMessages>
          )}
        </Section>
      )}

      <Section id="customer-consents" title={t("Detail.consents")}>
        {customer.consents.length === 0 ? (
          <p className="text-small text-muted-foreground">{t("Detail.noConsents")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {customer.consents.map((consent, index) => (
              <li key={`${consent.createdAt}-${consent.purpose}-${index}`} className="flex flex-wrap items-center gap-2 py-3 text-small first:pt-0 last:pb-0">
                <span className="font-medium">{t(`purposes.${consent.purpose as "privacy"}`)}</span>
                <span>{consent.granted ? t("Detail.granted") : t("Detail.withdrawn")}</span>
                <code className="text-muted-foreground">{consent.documentVersion}</code>
                <time dateTime={consent.createdAt} className="text-muted-foreground">
                  {adminDateTime(format, consent.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
