"use client";

import { Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ListEditor, type ListEditorLabels } from "@/components/admin/list-editor";
import { type ContentLocale, LocaleTabs } from "@/components/admin/locale-tabs";
import { MoneyInput } from "@/components/admin/money-input";
import { SeoFields } from "@/components/admin/seo-fields";
import { SlugInput } from "@/components/admin/slug-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AdminBlocksLabels = {
  heading: string;
  title: string;
  price: string;
  amountHint: string;
  locale: { vi: string; en: string; published: string; unpublished: string; missing: string };
  slug: { label: string; hint: string; generate: string; invalid: string };
  seo: { title: string; description: string; count: string; tooLong: string };
  list: ListEditorLabels & { label: string };
  confirm: { trigger: string; title: string; description: string; confirm: string; cancel: string; close: string; error: string };
};

/** The admin form building blocks on the design system page, so axe and E2E see them. */
export function AdminBlocksDemo({ labels }: { labels: AdminBlocksLabels }) {
  const id = useId();
  const [titles, setTitles] = useState<Record<ContentLocale, string>>({ vi: "Vịnh Hạ Long trên du thuyền riêng", en: "" });
  const [slugs, setSlugs] = useState<Record<ContentLocale, string>>({ vi: "", en: "" });
  const [seo, setSeo] = useState({ title: "", description: "" });
  const [price, setPrice] = useState<number | null>(45_900_000);
  const [highlights, setHighlights] = useState(["Ngủ đêm trên vịnh", "Bữa tối hải sản riêng", "Chèo kayak lúc bình minh"]);

  return (
    <section aria-labelledby={`${id}-heading`} className="flex max-w-3xl flex-col gap-8">
      <h2 id={`${id}-heading`} className="font-serif text-h2 font-medium">
        {labels.heading}
      </h2>
      <LocaleTabs
        labels={labels.locale}
        state={{ vi: { published: true, missing: false }, en: { published: false, missing: titles.en === "" } }}
      >
        {(locale) => (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-title-${locale}`}>{labels.title}</Label>
              <Input
                id={`${id}-title-${locale}`}
                value={titles[locale]}
                onChange={(event) => setTitles({ ...titles, [locale]: event.target.value })}
              />
            </div>
            <SlugInput
              value={slugs[locale]}
              onChange={(slug) => setSlugs({ ...slugs, [locale]: slug })}
              source={titles[locale]}
              prefix={locale === "vi" ? "/tours/" : "/en/tours/"}
              labels={labels.slug}
            />
          </div>
        )}
      </LocaleTabs>
      <SeoFields
        title={seo.title}
        description={seo.description}
        onTitleChange={(title) => setSeo({ ...seo, title })}
        onDescriptionChange={(description) => setSeo({ ...seo, description })}
        labels={labels.seo}
      />
      <div className="flex max-w-xs flex-col gap-2">
        <Label htmlFor={`${id}-price`}>{labels.price}</Label>
        <MoneyInput id={`${id}-price`} value={price} onChange={setPrice} aria-describedby={`${id}-price-hint`} />
        <p id={`${id}-price-hint`} className="text-small text-muted-foreground">
          {labels.amountHint}
        </p>
      </div>
      <ListEditor label={labels.list.label} value={highlights} onChange={setHighlights} labels={labels.list} />
      <div>
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="text-destructive">
              <Trash2 strokeWidth={1.5} aria-hidden="true" />
              {labels.confirm.trigger}
            </Button>
          }
          title={labels.confirm.title}
          description={labels.confirm.description}
          confirmLabel={labels.confirm.confirm}
          cancelLabel={labels.confirm.cancel}
          closeLabel={labels.confirm.close}
          errorLabel={labels.confirm.error}
          destructive
          onConfirm={() => undefined}
        />
      </div>
    </section>
  );
}
