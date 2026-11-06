import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminMessages } from "@/components/admin/admin-messages";
import { PageHeader } from "@/components/admin/page-header";
import { SettingsForms } from "@/components/admin/settings/settings-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { rolesFor } from "@/lib/auth/permissions";
import { getMediaPickerLabels } from "@/modules/media/media-labels";
import { getSettingsEditor } from "@/modules/settings/settings-admin.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Cài đặt" };

/** Settings, admin at aal2 only (spec Phase 2 step 21). */
export default async function SettingsPage() {
  await requireAdminAccess(rolesFor("settings.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Settings" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex max-w-4xl flex-col gap-8">
        <Suspense fallback={<Skeleton className="h-[48rem] w-full" aria-hidden="true" />}>
          <SettingsEditor />
        </Suspense>
        <section
          aria-labelledby="settings-policies-title"
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 md:p-8"
        >
          <h2 id="settings-policies-title" className="font-serif text-h3 font-semibold lg:text-h3-lg">
            {t("policiesTitle")}
          </h2>
          <p className="max-w-prose text-small text-muted-foreground">{t("policiesDescription")}</p>
          <Link
            href="/admin/cancellation-policies"
            className="inline-flex items-center gap-2 self-start py-1 text-small font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("policiesLink")}
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}

async function SettingsEditor() {
  const [editor, pickerLabels] = await Promise.all([getSettingsEditor(), getMediaPickerLabels()]);
  return (
    <AdminMessages namespaces={["Settings", "Taxonomy"]}>
      <SettingsForms
        values={editor.values}
        heroImage={editor.heroImage}
        destinations={editor.destinations}
        pickerLabels={pickerLabels}
      />
    </AdminMessages>
  );
}
