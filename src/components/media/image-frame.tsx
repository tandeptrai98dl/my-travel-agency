import { cx } from "@/lib/cx";

type Props = {
  className?: string;
  /** Alt text of the image this frame stands in for; without one the frame is decorative. */
  label?: string;
};

/**
 * Neutral stand-in at the size of a missing image (no media, or a file that failed to load), so
 * the layout never shifts (Phase 3 spec decision 1).
 */
export function ImageFrame({ className, label }: Props) {
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx(
        "absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--border))_0_60%,hsl(var(--muted))_60%_100%)]",
        className,
      )}
    />
  );
}
