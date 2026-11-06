"use client";

import { Check, Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { moderateReviewAction } from "@/modules/content/reviews.actions";
import type { ModerateReviewInput, ReviewStatus } from "@/modules/content/reviews.schemas";

import { useContentErrorText } from "./use-content-error-text";

type Props = { id: string; status: ReviewStatus; featured: boolean; author: string };

/** Approve, reject and feature one review (spec Phase 2 step 19). */
export function ReviewActions({ id, status, featured, author }: Props) {
  const t = useTranslations("Admin.Content.reviews");
  const errorText = useContentErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (input: ModerateReviewInput, done: string) =>
    start(async () => {
      const result = await moderateReviewAction(input);
      if (!result.ok) {
        toast({ title: errorText(result.error), variant: "destructive" });
        return;
      }
      toast({ title: done, variant: "success" });
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("actionsFor", { author })}>
      {status !== "approved" && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run({ id, action: "approve" }, t("approved"))}>
          <Check strokeWidth={1.5} aria-hidden="true" />
          {t("approve")}
        </Button>
      )}
      {status !== "rejected" && (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run({ id, action: "reject" }, t("rejected"))}>
          <X strokeWidth={1.5} aria-hidden="true" />
          {t("reject")}
        </Button>
      )}
      {status === "approved" && (
        <Button
          type="button"
          size="sm"
          variant={featured ? "secondary" : "ghost"}
          aria-pressed={featured}
          disabled={pending}
          onClick={() => run({ id, action: "feature", featured: !featured }, featured ? t("unfeatured") : t("featuredDone"))}
        >
          <Star strokeWidth={1.5} aria-hidden="true" className={featured ? "fill-current" : undefined} />
          {t("feature")}
        </Button>
      )}
    </div>
  );
}
