"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import type { STAFF_ROLES } from "@/lib/auth/permissions";
import { changeStaffRoleAction, setStaffActiveAction } from "@/modules/identity/staff.actions";

import { selectClass } from "./invite-staff-form";
import { useStaffErrorText } from "./use-staff-error-text";

type StaffRole = (typeof STAFF_ROLES)[number];

type Props = {
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
  /** Your own row, or the last active admin: the controls are shown disabled with the reason. */
  blockedReason: string | null;
  roleLabels: Record<StaffRole, string>;
};

/** Role change and deactivation for one staff member; the server and the database check again. */
export function StaffRowActions({ id, name, role, active, blockedReason, roleLabels }: Props) {
  const t = useTranslations("Admin.Staff");
  const errorText = useStaffErrorText();
  const router = useRouter();
  const selectId = useId();
  const [next, setNext] = useState<StaffRole>(role);
  const [pending, start] = useTransition();
  const blocked = blockedReason !== null;

  const saveRole = () =>
    start(async () => {
      const result = await changeStaffRoleAction({ id, role: next });
      if (!result.ok) {
        toast({ title: errorText(result.error), variant: "destructive" });
        setNext(role);
        return;
      }
      toast({ title: t("roleSaved", { name }), variant: "success" });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={t("actionsFor", { name })}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          {t("roleFor", { name })}
        </label>
        <select
          id={selectId}
          className={`${selectClass} w-auto min-w-44`}
          value={next}
          disabled={blocked || pending}
          aria-describedby={blocked ? `${selectId}-hint` : undefined}
          onChange={(event) => setNext(event.target.value as StaffRole)}
        >
          {(Object.keys(roleLabels) as StaffRole[]).map((value) => (
            <option key={value} value={value}>
              {roleLabels[value]}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" variant="outline" disabled={blocked || pending || next === role} onClick={saveRole}>
          {t("saveRole")}
        </Button>
        <ConfirmDialog
          trigger={
            <Button type="button" size="sm" variant={active ? "ghost" : "outline"} disabled={blocked || pending}>
              {active ? t("deactivate") : t("reactivate")}
            </Button>
          }
          title={active ? t("deactivateTitle", { name }) : t("reactivateTitle", { name })}
          description={active ? t("deactivateDescription") : t("reactivateDescription")}
          confirmLabel={active ? t("deactivate") : t("reactivate")}
          cancelLabel={t("cancel")}
          closeLabel={t("close")}
          errorLabel={t("errors.failed")}
          destructive={active}
          onConfirm={async () => {
            const result = await setStaffActiveAction({ id, active: !active });
            if (!result.ok) {
              toast({ title: errorText(result.error), variant: "destructive" });
              return;
            }
            toast({ title: active ? t("deactivated", { name }) : t("reactivated", { name }), variant: "success" });
            router.refresh();
          }}
        />
      </div>
      {blocked && (
        <p id={`${selectId}-hint`} className="text-small text-muted-foreground">
          {blockedReason}
        </p>
      )}
    </div>
  );
}
