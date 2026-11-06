import { Container } from "@/components/layout/container";
import { ResponsiveImage } from "@/components/media/responsive-image";
import { Eyebrow } from "@/components/typography/eyebrow";
import type { ImageData } from "@/lib/images";

type Props = {
  eyebrow: string | null;
  title: string;
  summary: string | null;
  facts?: { label: string; value: string }[];
  image: ImageData | null;
  breadcrumbs: React.ReactNode;
};

/**
 * Editorial header of a destination or travel style page: breadcrumbs, eyebrow, title, summary
 * and key facts, then a wide photo when there is one (no frame without one).
 */
export function PlaceHeader({ eyebrow, title, summary, facts = [], image, breadcrumbs }: Props) {
  return (
    <header>
      <Container className="flex flex-col gap-8 pb-10 pt-6 md:pb-14">
        {breadcrumbs}
        <div className="flex max-w-3xl flex-col gap-5">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className="text-balance font-serif text-h1 font-medium md:text-h1-lg">{title}</h1>
          {summary && <p className="text-body-lg text-muted-foreground md:text-body-lg-lg">{summary}</p>}
          {facts.length > 0 && (
            <dl className="flex flex-wrap gap-x-10 gap-y-3 border-t border-border pt-5">
              {facts.map((fact) => (
                <div key={fact.label} className="flex flex-col gap-1">
                  <dt className="text-eyebrow font-semibold uppercase text-muted-foreground">{fact.label}</dt>
                  <dd className="text-body">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </Container>
      {image && (
        <Container>
          <div className="relative aspect-[3/2] overflow-hidden bg-muted md:aspect-[21/9]">
            <ResponsiveImage image={image} sizes="(min-width: 1280px) 1216px, 100vw" priority />
          </div>
        </Container>
      )}
    </header>
  );
}
