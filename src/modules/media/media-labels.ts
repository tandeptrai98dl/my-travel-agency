import "server-only";

import { getTranslations } from "next-intl/server";

import type { MediaPickerLabels } from "@/components/admin/media/media-picker";
import type { UploaderLabels } from "@/components/admin/media/media-uploader";

/** Vietnamese admin strings for the uploader and picker (plain strings for client components). */
export async function getUploaderLabels(): Promise<UploaderLabels> {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Media" });
  return {
    chooseFiles: t("chooseFiles"),
    dropHint: t("dropHint"),
    uploadsTitle: t("uploadsTitle"),
    uploading: t.raw("uploading") as string,
    uploaded: t.raw("uploaded") as string,
    failed: t.raw("uploadFailed") as string,
    reasons: t.raw("errors") as Record<string, string>,
    loading: t("loading"),
  };
}

export async function getMediaPickerLabels(): Promise<MediaPickerLabels> {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return {
    title: t("Media.pickerTitle"),
    description: t("Media.pickerDescription"),
    search: t("Media.search"),
    empty: t("Media.empty"),
    loading: t("Media.loading"),
    loadMore: t("Media.loadMore"),
    selectCount: t.raw("Media.selectCount") as string,
    select: t("Media.select"),
    cancel: t("Form.cancel"),
    close: t("Shell.close"),
    altMissing: t("Media.altMissing"),
    forbidden: t("Media.forbidden"),
    uploader: await getUploaderLabels(),
  };
}
