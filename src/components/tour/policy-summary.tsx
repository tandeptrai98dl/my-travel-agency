type Props = {
  payment: { title: string; text: string };
  cancellation: { title: string; lines: string[] } | null;
};

/** Deposit terms and the cancellation policy, side by side from `md`. */
export function PolicySummary({ payment, cancellation }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
        <h3 className="font-serif text-h4 font-semibold md:text-h4-lg">{payment.title}</h3>
        <p className="text-body">{payment.text}</p>
      </div>
      {cancellation && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
          <h3 className="font-serif text-h4 font-semibold md:text-h4-lg">{cancellation.title}</h3>
          {cancellation.lines.map((line) => (
            <p key={line} className="text-body">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
