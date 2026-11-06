"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ContentLocale = "vi" | "en";

type LocaleState = { published: boolean; missing: boolean };

type Props = {
  value?: ContentLocale;
  onValueChange?: (locale: ContentLocale) => void;
  state: Record<ContentLocale, LocaleState>;
  labels: Record<ContentLocale, string> & { published: string; unpublished: string; missing: string };
  children: (locale: ContentLocale) => React.ReactNode;
};

const LOCALES: ContentLocale[] = ["vi", "en"];

/**
 * VI/EN editing tabs (ADR-006: each translation has its own fields and publish switch). Each tab
 * shows whether that language is published and whether required fields are missing, in text as
 * well as with an icon.
 */
export function LocaleTabs({ value, onValueChange, state, labels, children }: Props) {
  return (
    <Tabs
      defaultValue={value === undefined ? "vi" : undefined}
      value={value}
      onValueChange={(next) => onValueChange?.(next as ContentLocale)}
    >
      <TabsList>
        {LOCALES.map((locale) => {
          const { published, missing } = state[locale];
          const status = missing ? labels.missing : published ? labels.published : labels.unpublished;
          return (
            <TabsTrigger key={locale} value={locale} className="gap-2">
              {labels[locale]}
              {missing ? (
                <AlertCircle className="h-4 w-4 text-destructive" strokeWidth={1.5} aria-hidden="true" />
              ) : published ? (
                <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.5} aria-hidden="true" />
              ) : null}
              <span className="sr-only">({status})</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
      {LOCALES.map((locale) => (
        <TabsContent key={locale} value={locale} lang={locale} forceMount className="data-[state=inactive]:hidden">
          {children(locale)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
