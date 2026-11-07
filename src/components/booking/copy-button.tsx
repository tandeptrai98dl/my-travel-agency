"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("Checkout");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={t("copy", { label })}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" /> : <Copy className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
      <span aria-live="polite">{copied ? t("copied") : ""}</span>
    </Button>
  );
}
