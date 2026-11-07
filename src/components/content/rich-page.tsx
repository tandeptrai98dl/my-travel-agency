import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/typography/eyebrow";
import { RichText } from "@/components/typography/rich-text";
import type { ContentMedia } from "@/modules/content/public/rich-media";

type Props = {
  locale: "vi" | "en";
  eyebrow?: string | null;
  title: string;
  /** "Updated …" line, already formatted. */
  meta?: string | null;
  content: unknown | null;
  media: Record<string, ContentMedia>;
  breadcrumbs: React.ReactNode;
  children?: React.ReactNode;
};

/** A static page (about, FAQ, policies): breadcrumbs, title and rich text in a 680 px column. */
export function RichPage({ locale, eyebrow, title, meta, content, media, breadcrumbs, children }: Props) {
  return (
    <Container className="flex flex-col gap-10 pb-24 pt-6 md:gap-14">
      {breadcrumbs}
      <article className="mx-auto flex w-full max-w-[680px] flex-col gap-8">
        <header className="flex flex-col gap-4">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className="text-balance font-serif text-h1 font-medium md:text-h1-lg">{title}</h1>
          {meta && <p className="text-small text-muted-foreground">{meta}</p>}
        </header>
        {content !== null && <RichText content={content} locale={locale} media={media} />}
        {children}
      </article>
    </Container>
  );
}
