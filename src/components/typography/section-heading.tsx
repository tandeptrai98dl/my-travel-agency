import * as React from "react";

import { cn } from "@/lib/utils";

import { Eyebrow } from "./eyebrow";
import { Heading, type HeadingProps } from "./heading";

type Props = {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  level?: HeadingProps["level"];
  size?: HeadingProps["size"];
  align?: "start" | "center";
  className?: string;
};

/** Eyebrow + heading + optional lead paragraph, used at the top of page sections. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  level = 2,
  size = "h2",
  align = "start",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex max-w-prose flex-col gap-4",
        align === "center" && "mx-auto items-center text-center",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Heading level={level} size={size}>
        {title}
      </Heading>
      {description && (
        <p className="text-body-lg text-muted-foreground md:text-body-lg-lg">{description}</p>
      )}
    </div>
  );
}
