import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PageHeader } from "@/components/admin/page-header";
import { InviteStaffForm } from "@/components/admin/staff/invite-staff-form";
import { StaffRowActions } from "@/components/admin/staff/staff-row-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor, STAFF_ROLES } from "@/lib/auth/permissions";
import { staffChangeBlock } from "@/modules/identity/staff.schemas";
import { listStaff } from "@/modules/identity/staff.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Nhân viên" };

const STATUS_VARIANT = { invited: "warning", active: "success", deactivated: "secondary" } as const;

/** Staff accounts, admin at aal2 only (spec Phase 2 step 22, ADR-032). */
export default async function StaffPage() {
  await requireAdminAccess(rolesFor("staff.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const roleLabels = Object.fromEntries(STAFF_ROLES.map((role) => [role, t(`roles.${role}`)])) as Record<
    (typeof STAFF_ROLES)[number],
    string
  >;
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader title={t("Staff.title")} description={t("Staff.description")} />
      <AdminMessages namespaces={["Staff"]}>
        <section aria-labelledby="staff-invite-title" className="flex max-w-5xl flex-col gap-4 rounded-lg border border-border bg-card p-5 md:p-8">
          <h2 id="staff-invite-title" className="font-serif text-h3 font-semibold lg:text-h3-lg">
            {t("Staff.inviteTitle")}
          </h2>
          <p className="max-w-prose text-small text-muted-foreground">{t("Staff.inviteDescription")}</p>
          <InviteStaffForm roleLabels={roleLabels} />
          <p className="text-small text-muted-foreground">{t("Staff.emailDependency")}</p>
        </section>
        <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
          <StaffList roleLabels={roleLabels} />
        </Suspense>
      </AdminMessages>
    </div>
  );
}

async function StaffList({ roleLabels }: { roleLabels: Record<(typeof STAFF_ROLES)[number], string> }) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Staff" });
  const format = await getFormatter({ locale: "vi" });
  const staff = await listStaff();
  if (staff.length === 0) return <EmptyState title={t("empty")} />;
  const self = staff.find((member) => member.isSelf);
  const activeAdminIds = staff.filter((member) => member.role === "admin" && member.status !== "deactivated").map((member) => member.id);

  return (
    <section aria-labelledby="staff-list-title" className="flex flex-col gap-4">
      <h2 id="staff-list-title" className="font-serif text-h3 font-semibold lg:text-h3-lg">
        {t("listTitle")}
      </h2>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[56rem] text-small">
          <caption className="sr-only">{t("listTitle")}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">{t("name")}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t("status")}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t("mfa")}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t("lastSignIn")}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => {
              const name = member.name ?? member.email;
              const block = staffChangeBlock(
                { id: member.id, role: member.role, active: member.status !== "deactivated" },
                // Any change the row offers: a demotion and a deactivation.
                { role: member.role === "admin" ? "editor" : undefined, active: false },
                { selfId: self?.id ?? "", activeAdminIds },
              );
              const blockedReason = block === "selfChange" ? t("selfHint") : block === "lastAdmin" ? t("errors.lastAdmin") : null;
              return (
                <tr key={member.id} className="border-b border-border align-top last:border-0" data-testid="staff-row">
                  <th scope="row" className="px-4 py-4 text-left font-normal">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {name}
                      {member.isSelf && <Badge variant="outline">{t("you")}</Badge>}
                    </span>
                    <span className="block break-all text-muted-foreground">{member.email}</span>
                    <span className="block text-muted-foreground">{roleLabels[member.role]}</span>
                    <Link
                      href={`/admin/audit-log?actor=${member.id}`}
                      className="mt-1 inline-block py-1 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {t("viewAudit")}
                      <span className="sr-only">: {name}</span>
                    </Link>
                  </th>
                  <td className="px-4 py-4">
                    <Badge variant={STATUS_VARIANT[member.status]}>{t(`statuses.${member.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-4">{member.mfa ? t("mfaOn") : t("mfaOff")}</td>
                  <td className="whitespace-nowrap px-4 py-4">
                    {member.lastSignInAt ? (
                      <time dateTime={member.lastSignInAt}>
                        {format.dateTime(new Date(member.lastSignInAt), {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Ho_Chi_Minh",
                        })}
                      </time>
                    ) : (
                      <span className="text-muted-foreground">{t("never")}</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <StaffRowActions
                      id={member.id}
                      name={name}
                      role={member.role}
                      active={member.status !== "deactivated"}
                      blockedReason={blockedReason}
                      roleLabels={roleLabels}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {activeAdminIds.length === 1 && (
        <Alert variant="warning">
          <AlertDescription>{t("errors.lastAdmin")}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
