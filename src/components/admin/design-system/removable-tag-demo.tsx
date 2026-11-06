"use client";

import { useState } from "react";

import { Tag } from "@/components/ui/tag";

/** A removable Tag for the review page (the remove button needs a client handler). */
export function RemovableTagDemo({ label, removeLabel }: { label: string; removeLabel: string }) {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <Tag onRemove={() => setShown(false)} removeLabel={removeLabel}>
      {label}
    </Tag>
  );
}
