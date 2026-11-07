import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading } from "@/components/typography/heading";

type Props = {
  eyebrow: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/** Frame of the sign-in pages: a quiet card in a 480 px column, one action per page. */
export function AuthShell({ eyebrow, title, intro, children, footer }: Props) {
  return (
    <Container className="flex justify-center py-12 md:py-20">
      <div className="flex w-full max-w-[30rem] flex-col gap-8">
        <div className="flex flex-col gap-3">
          <Eyebrow>{eyebrow}</Eyebrow>
          <Heading level={1} size="h2">
            {title}
          </Heading>
          <div aria-hidden="true" className="h-px w-12 bg-gold" />
          {intro ? <p className="text-body text-muted-foreground">{intro}</p> : null}
        </div>
        <div className="rounded-lg border border-border bg-card p-6 md:p-8">{children}</div>
        {footer ? <div className="flex flex-col gap-2 text-small">{footer}</div> : null}
      </div>
    </Container>
  );
}
