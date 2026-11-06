import { Heading } from "@/components/typography/heading";

type Props = { eyebrow: string | null; title: string; subtitle: string | null };

/** Eyebrow (destinations), the tour name as the page's h1 and its subtitle. */
export function TourHeader({ eyebrow, title, subtitle }: Props) {
  return (
    <header className="flex max-w-4xl flex-col gap-4">
      {eyebrow && <p className="text-eyebrow font-semibold uppercase text-muted-foreground">{eyebrow}</p>}
      <Heading level={1} size="h1">
        {title}
      </Heading>
      {subtitle && <p className="text-body-lg text-muted-foreground md:text-body-lg-lg">{subtitle}</p>}
    </header>
  );
}
