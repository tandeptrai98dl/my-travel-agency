import { Check, Minus } from "lucide-react";

type Props = { included: string[]; excluded: string[]; excludedTitle: string };

/** What the price includes, and what it does not. */
export function InclusionsList({ included, excluded, excludedTitle }: Props) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      {included.length > 0 && (
        <ul className="flex flex-col gap-3">
          {included.map((item) => (
            <li key={item} className="flex gap-3 text-body">
              <Check aria-hidden="true" strokeWidth={1.5} className="mt-1 h-5 w-5 shrink-0 text-success" />
              {item}
            </li>
          ))}
        </ul>
      )}
      {excluded.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-small font-semibold">{excludedTitle}</h3>
          <ul className="flex flex-col gap-3">
            {excluded.map((item) => (
              <li key={item} className="flex gap-3 text-body text-muted-foreground">
                <Minus aria-hidden="true" strokeWidth={1.5} className="mt-1 h-5 w-5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
