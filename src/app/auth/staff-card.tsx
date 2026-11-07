import { Heading } from "@/components/typography/heading";

/** The card of the staff sign-in pages. */
export function StaffCard({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 md:p-8">
      <div className="flex flex-col gap-2">
        <Heading level={1} size="h3">
          {title}
        </Heading>
        {intro ? <p className="text-small text-muted-foreground">{intro}</p> : null}
      </div>
      {children}
    </div>
  );
}
