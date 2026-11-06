type Fact = { label: string; value: string };

/** The tour's key facts in one bordered row (two columns on phones). */
export function TourFactsBar({ facts, label }: { facts: Fact[]; label: string }) {
  return (
    <dl
      aria-label={label}
      className="grid grid-cols-2 border-y border-border md:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]"
    >
      {facts.map((fact, index) => (
        <div
          key={fact.label}
          className={
            "flex flex-col gap-1 border-border py-4 md:py-5 " +
            (index % 2 === 1 ? "border-l pl-4 md:pl-6 " : "pr-4 md:pr-6 ") +
            (index > 1 ? "border-t md:border-t-0 " : "") +
            (index > 0 ? "md:border-l md:pl-6" : "")
          }
        >
          <dt className="text-eyebrow font-semibold uppercase text-muted-foreground">{fact.label}</dt>
          <dd className="text-body font-semibold md:text-h4-lg">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
