import { Plus } from "lucide-react";

/** Questions as native disclosure widgets: keyboard and screen-reader ready, no JavaScript. */
export function FaqList({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div className="border-t border-border">
      {items.map((item, index) => (
        <details key={item.question} open={index === 0} className="group border-b border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-4 text-body font-medium md:text-body-lg [&::-webkit-details-marker]:hidden">
            {item.question}
            <Plus
              aria-hidden="true"
              strokeWidth={1.5}
              className="h-5 w-5 shrink-0 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
            />
          </summary>
          <p className="max-w-prose whitespace-pre-line pb-5 text-body text-muted-foreground">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
