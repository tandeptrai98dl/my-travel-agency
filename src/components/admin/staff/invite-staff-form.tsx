"use client";

import "@/lib/zod-config";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Path, useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { inviteStaffAction } from "@/modules/identity/staff.actions";
import { type InviteStaffInput, inviteStaffSchema } from "@/modules/identity/staff.schemas";

import { useStaffErrorText } from "./use-staff-error-text";

export const selectClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-small text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

/** Invite one staff member with their role (spec Phase 2 step 22, decision 8). */
export function InviteStaffForm({ roleLabels }: { roleLabels: Record<(typeof STAFF_ROLES)[number], string> }) {
  const t = useTranslations("Admin.Staff");
  const errorText = useStaffErrorText();
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<InviteStaffInput>({
    resolver: zodResolver(inviteStaffSchema, undefined, { raw: true }),
    defaultValues: { email: "", fullName: "", role: "sales" },
  });

  async function onSubmit(values: InviteStaffInput) {
    setAlert(null);
    const result = await inviteStaffAction(values);
    if (!result.ok) {
      const fields: Record<string, string> = { ...("fields" in result ? result.fields : {}) };
      if ("field" in result && result.field) fields[result.field] = result.error;
      for (const [name, message] of Object.entries(fields)) {
        form.setError(name as Path<InviteStaffInput>, { type: "server", message });
      }
      if (Object.keys(fields).length === 0) setAlert(errorText(result.error));
      return;
    }
    toast({ title: t("invited", { email: values.email.trim().toLowerCase() }), variant: "success" });
    form.reset({ email: "", fullName: "", role: values.role });
    router.refresh();
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" aria-labelledby="staff-invite-title">
        {alert && (
          <Alert variant="destructive" live="assertive">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-5 md:grid-cols-[1fr_1fr_14rem]">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("email")}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="off" maxLength={200} {...field} />
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fullName")}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" maxLength={120} {...field} />
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("role")}</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field}>
                    {STAFF_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
        </div>
        <div>
          <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("inviting") : t("invite")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
