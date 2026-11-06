import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { ContactForm } from "@/components/admin/bookings/contact-form";
import { MoneyActionForm } from "@/components/admin/bookings/money-action-form";
import { NoteActionForm } from "@/components/admin/bookings/note-action-form";
import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { type CurrentUser } from "@/lib/auth/get-user";
import { can, rolesFor } from "@/lib/auth/permissions";
import { formatVnd } from "@/lib/money";
import { type BookingDetail } from "@/modules/booking/booking-admin.schemas";
import { getBooking } from "@/modules/booking/booking-admin.service";
import { canCancel } from "@/modules/booking/state-machine";

import { requireAdminAccess } from "../../../admin-gate";
import { adminDate, adminDateTime } from "../format";

export const metadata: Metadata = { title: "Chi tiết đặt tour" };

type Props = { params: Promise<{ id: string }> };

const KNOWN_EVENTS = [
  "created",
  "repriced",
  "status_changed",
  "payment_method_changed",
  "payment_received",
  "needs_attention",
  "manual_payment",
  "refund",
  "cancel_requested",
  "attention_resolved",
  "transfer_assigned",
] as const;

/** Booking detail (spec Phase 4 step 16): lines, travellers, payments, timeline and the role's actions. */
export default async function BookingDetailPage({ params }: Props) {
  await requireAdminAccess(rolesFor("bookings.read"));
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" aria-hidden="true" />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

/** What is still due: the deposit until it is paid (deposit plan), then the rest. */
function amountDue(booking: BookingDetail): number | null {
  const rest = booking.total - booking.amountPaid;
  if (rest <= 0) return null;
  if (booking.paymentPlan === "deposit" && booking.status !== "confirmed" && booking.amountPaid < booking.depositAmount) {
    return booking.depositAmount - booking.amountPaid;
  }
  return rest;
}

async function Detail({ params }: Props) {
  const id = z.guid().safeParse((await params).id).data;
  if (!id) notFound();
  const user = await requireAdminAccess(rolesFor("bookings.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const booking = await getBooking(id);
  if (!booking) notFound();
  return (
    <>
      <PageHeader
        title={booking.code}
        description={`${booking.tourCode} · ${booking.tourTitle}`}
        breadcrumbs={[{ label: t("Bookings.title"), href: "/admin/bookings" }, { label: booking.code }]}
        breadcrumbLabel={t("Shell.breadcrumb")}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge kind="booking" status={booking.status} label={t(`Bookings.statuses.${booking.status}`)} />
            <StatusBadge kind="payment" status={booking.paymentState} label={t(`Bookings.paymentStates.${booking.paymentState}`)} />
          </div>
        }
      />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Summary booking={booking} />
          <Prices booking={booking} />
          <Travellers booking={booking} />
          <Payments booking={booking} />
          <Timeline booking={booking} />
        </div>
        <AdminMessages namespaces={["BookingDetail", "Bookings"]}>
          <Actions booking={booking} user={user} />
        </AdminMessages>
      </div>
    </>
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

async function Summary({ booking }: { booking: BookingDetail }) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.BookingDetail" });
  const format = await getFormatter({ locale: "vi" });
  return (
    <Section id="booking-summary" title={t("summary")}>
      {booking.departureStatus === "cancelled" && (
        <Alert variant="warning">
          <AlertDescription>{t("departureCancelled")}</AlertDescription>
        </Alert>
      )}
      {booking.cancelReason && <p className="text-small">{t("cancelledReason", { reason: booking.cancelReason })}</p>}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t("tour")}>
          <code>{booking.tourCode}</code> {booking.tourTitle}
        </Fact>
        <Fact label={t("departure")}>
          {booking.departureId ? (
            <Link href={`/admin/bookings?departure=${booking.departureId}`} className="underline underline-offset-4">
              {adminDate(format, booking.startDate)}
            </Link>
          ) : (
            adminDate(format, booking.startDate)
          )}
        </Fact>
        <Fact label={t("party")}>
          {t("partyValue", { adults: booking.adults, children: booking.children, infants: booking.infants, rooms: booking.singleRooms })}
        </Fact>
        <Fact label={t("type")}>{t(`types.${booking.type}`)}</Fact>
        <Fact label={t("language")}>{t(`languages.${booking.locale}`)}</Fact>
        <Fact label={t("owner")}>{booking.owner ?? "—"}</Fact>
        <Fact label={t("createdAt")}>{adminDateTime(format, booking.createdAt)}</Fact>
        {booking.holdExpiresAt && <Fact label={t("holdUntil")}>{adminDateTime(format, booking.holdExpiresAt)}</Fact>}
        {booking.balanceDueDate && <Fact label={t("balanceDue")}>{adminDate(format, booking.balanceDueDate)}</Fact>}
      </dl>
      <h3 className="font-sans text-h4 font-semibold">{t("contactTitle")}</h3>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t("contactName")}>{booking.contactName}</Fact>
        <Fact label={t("contactEmail")}>
          <span className="break-all">{booking.contactEmail}</span>
        </Fact>
        <Fact label={t("contactPhone")}>{booking.contactPhone}</Fact>
        {booking.contactCountry && <Fact label={t("contactCountry")}>{booking.contactCountry}</Fact>}
        <Fact label={t("specialRequests")}>{booking.specialRequests || t("none")}</Fact>
      </dl>
      {booking.invoiceRequested && booking.invoiceInfo && (
        <>
          <h3 className="font-sans text-h4 font-semibold">{t("invoice")}</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            {(["company_name", "tax_code", "address", "email"] as const).map((key) =>
              booking.invoiceInfo?.[key] ? (
                <Fact key={key} label={t(`invoiceFields.${key}`)}>
                  {booking.invoiceInfo[key]}
                </Fact>
              ) : null,
            )}
          </dl>
        </>
      )}
    </Section>
  );
}

async function Prices({ booking }: { booking: BookingDetail }) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const vnd = (amount: number) => formatVnd(amount, "vi");
  const balance = Math.max(booking.total - booking.amountPaid, 0);
  return (
    <Section id="booking-prices" title={t("BookingDetail.priceTitle")}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-small">
          <caption className="sr-only">{t("BookingDetail.priceTitle")}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-medium">{t("BookingDetail.item")}</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">{t("BookingDetail.unitPrice")}</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">{t("BookingDetail.quantity")}</th>
              <th scope="col" className="py-2 text-right font-medium">{t("BookingDetail.lineAmount")}</th>
            </tr>
          </thead>
          <tbody>
            {booking.items.map((item) => (
              <tr key={item.id} className="border-b border-border">
                <th scope="row" className="py-2 pr-4 text-left font-normal">
                  {t(`Bookings.itemTypes.${item.type}`)}
                  {item.label && <span className="block text-muted-foreground">{item.label}</span>}
                </th>
                <td className="py-2 pr-4 text-right">{vnd(item.unitPrice)}</td>
                <td className="py-2 pr-4 text-right">{item.quantity}</td>
                <td className="py-2 text-right">{vnd(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-x-8 gap-y-2 text-small sm:grid-cols-[auto_auto] sm:justify-end">
        <dt className="text-muted-foreground">{t("BookingDetail.subtotal")}</dt>
        <dd className="text-right">{vnd(booking.subtotal)}</dd>
        {booking.discountTotal > 0 && (
          <>
            <dt className="text-muted-foreground">{t("BookingDetail.discount")}</dt>
            <dd className="text-right">−{vnd(booking.discountTotal)}</dd>
          </>
        )}
        <dt className="font-semibold">{t("BookingDetail.total")}</dt>
        <dd className="text-right font-semibold">{vnd(booking.total)}</dd>
        <dt className="text-muted-foreground">{t("BookingDetail.plan")}</dt>
        <dd className="text-right">{t(`BookingDetail.plans.${booking.paymentPlan}`)}</dd>
        <dt className="text-muted-foreground">{t("BookingDetail.deposit")}</dt>
        <dd className="text-right">{vnd(booking.depositAmount)}</dd>
        <dt className="text-muted-foreground">{t("BookingDetail.paid")}</dt>
        <dd className="text-right">{vnd(booking.amountPaid)}</dd>
        <dt className="font-semibold">{t("BookingDetail.balance")}</dt>
        <dd className="text-right font-semibold">{vnd(balance)}</dd>
      </dl>
    </Section>
  );
}

async function Travellers({ booking }: { booking: BookingDetail }) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.BookingDetail" });
  const format = await getFormatter({ locale: "vi" });
  return (
    <Section id="booking-travellers" title={t("travellersTitle")}>
      {booking.travellers.length === 0 ? (
        <p className="text-small text-muted-foreground">{t("noTravellers")}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-small">
          {booking.travellers.map((traveller) => (
            <li key={traveller.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{traveller.fullName}</span>
              {traveller.isLead && <Badge variant="secondary">{t("lead")}</Badge>}
              {traveller.dateOfBirth && (
                <span className="text-muted-foreground">
                  {t("dateOfBirth")}: {adminDate(format, traveller.dateOfBirth)}
                </span>
              )}
              {traveller.nationality && (
                <span className="text-muted-foreground">
                  {t("nationality")}: {traveller.nationality}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

async function Payments({ booking }: { booking: BookingDetail }) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  return (
    <Section id="booking-payments" title={t("BookingDetail.paymentsTitle")}>
      {booking.payments.length === 0 ? (
        <p className="text-small text-muted-foreground">{t("BookingDetail.noPayments")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-small">
            <caption className="sr-only">{t("BookingDetail.paymentsTitle")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">{t("BookingDetail.reference")}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t("BookingDetail.provider")}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t("BookingDetail.status")}</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">{t("Payments.amount")}</th>
                <th scope="col" className="py-2 font-medium">{t("BookingDetail.date")}</th>
              </tr>
            </thead>
            <tbody>
              {booking.payments.map((payment) => (
                <tr key={payment.id} className="border-b border-border align-top">
                  <th scope="row" className="py-2 pr-4 text-left font-normal">
                    <code>{payment.reference}</code>
                    <span className="block text-muted-foreground">{t(`Bookings.kinds.${payment.kind}`)}</span>
                    {payment.note && <span className="block text-muted-foreground">{payment.note}</span>}
                    {payment.recordedBy && (
                      <span className="block text-muted-foreground">{t("BookingDetail.recordedBy", { name: payment.recordedBy })}</span>
                    )}
                  </th>
                  <td className="py-2 pr-4">{t(`Bookings.providers.${payment.provider}`)}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge kind="transaction" status={payment.status} label={t(`Bookings.transactionStatuses.${payment.status}`)} />
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right">
                    {payment.kind === "refund" ? "−" : ""}
                    {formatVnd(payment.amount, "vi")}
                  </td>
                  <td className="whitespace-nowrap py-2">{adminDateTime(format, payment.paidAt ?? payment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

async function Timeline({ booking }: { booking: BookingDetail }) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const label = (type: string) =>
    (KNOWN_EVENTS as readonly string[]).includes(type) ? t(`Bookings.events.${type as (typeof KNOWN_EVENTS)[number]}`) : t("Bookings.events.other");
  return (
    <Section id="booking-timeline" title={t("BookingDetail.timelineTitle")}>
      {booking.events.length === 0 ? (
        <p className="text-small text-muted-foreground">{t("BookingDetail.noEvents")}</p>
      ) : (
        <ol className="flex flex-col gap-4 border-l border-border pl-5">
          {booking.events.map((event) => (
            <li key={event.id} className="relative flex flex-col gap-1 text-small">
              <span aria-hidden="true" className="absolute -left-[1.6rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{label(event.type)}</span>
                {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus && (
                  <span className="text-muted-foreground">
                    {t("BookingDetail.statusChange", {
                      from: t(`Bookings.statuses.${event.fromStatus}`),
                      to: t(`Bookings.statuses.${event.toStatus}`),
                    })}
                  </span>
                )}
              </span>
              {event.message && <span className="break-words">{event.message}</span>}
              <span className="text-muted-foreground">
                <time dateTime={event.createdAt}>{adminDateTime(format, event.createdAt)}</time> · {event.actor ?? t("Bookings.system")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

async function Actions({ booking, user }: { booking: BookingDetail; user: CurrentUser }) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const cancellable = canCancel(booking.status);
  const panels: React.ReactNode[] = [];
  if (booking.needsAttention && booking.attentionReason && can(user.role, "bookings.resolve_attention")) {
    panels.push(
      <div key="attention" className="flex flex-col gap-4">
        <Alert variant="warning">
          <AlertTitle>{t("BookingDetail.attentionTitle", { reason: t(`Bookings.reasons.${booking.attentionReason}`) })}</AlertTitle>
        </Alert>
        <NoteActionForm bookingId={booking.id} code={booking.code} kind="resolve" />
      </div>,
    );
  }
  if (booking.status !== "draft" && can(user.role, "payments.record")) {
    panels.push(<MoneyActionForm key="payment" bookingId={booking.id} kind="payment" defaultAmount={amountDue(booking)} />);
  }
  if (booking.amountPaid > 0 && can(user.role, "payments.refund")) {
    panels.push(
      <MoneyActionForm key="refund" bookingId={booking.id} kind="refund" defaultAmount={null} maxAmount={booking.amountPaid} />,
    );
  }
  if (cancellable && can(user.role, "bookings.change_status")) {
    panels.push(<NoteActionForm key="cancel" bookingId={booking.id} code={booking.code} kind="cancel" />);
  } else if (cancellable && booking.attentionReason !== "cancel_requested" && can(user.role, "bookings.request_cancellation")) {
    panels.push(<NoteActionForm key="request" bookingId={booking.id} code={booking.code} kind="request" />);
  }
  if (can(user.role, "bookings.edit")) {
    panels.push(
      <ContactForm
        key="contact"
        defaults={{
          bookingId: booking.id,
          contactName: booking.contactName,
          contactEmail: booking.contactEmail,
          contactPhone: booking.contactPhone,
          specialRequests: booking.specialRequests ?? "",
        }}
      />,
    );
  }
  return (
    <aside aria-labelledby="booking-actions" className="flex flex-col gap-6 self-start rounded-lg border border-border bg-card p-5">
      <h2 id="booking-actions" className="font-serif text-h3 font-semibold">
        {t("BookingDetail.actionsTitle")}
      </h2>
      {panels.length === 0 ? (
        <p className="text-small text-muted-foreground">{t("BookingDetail.noActions")}</p>
      ) : (
        panels.map((panel, index) => (
          <div key={index} className={index > 0 ? "border-t border-border pt-6" : undefined}>
            {panel}
          </div>
        ))
      )}
    </aside>
  );
}
