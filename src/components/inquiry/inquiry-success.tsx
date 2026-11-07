"use client";

import { useEffect, useRef } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { localizedPath } from "@/i18n/paths";

export type InquirySuccessLabels = { title: string; text: string; textNoCode: string; next: string; tours: string; home: string };

/** After an inquiry is sent: its code, what happens next, and the way back (DESIGN_SYSTEM "Consultation"). */
export function InquirySuccess({ code, labels, locale }: { code: string | null; labels: InquirySuccessLabels; locale: "vi" | "en" }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div role="status" className="flex max-w-2xl flex-col gap-5 border-y border-border py-10">
      <h2 ref={heading} tabIndex={-1} className="font-serif text-h3 font-semibold focus:outline-none md:text-h3-lg">
        {labels.title}
      </h2>
      <p className="text-body-lg">{code ? labels.text.replace("{code}", code) : labels.textNoCode}</p>
      <p className="text-body text-muted-foreground">{labels.next}</p>
      <div className="flex flex-wrap gap-3">
        <a href={localizedPath(locale, "/tours")} className={buttonVariants({})}>
          {labels.tours}
        </a>
        <a href={localizedPath(locale, "/")} className={buttonVariants({ variant: "outline" })}>
          {labels.home}
        </a>
      </div>
    </div>
  );
}
