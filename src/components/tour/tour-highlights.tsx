/** Up to six highlights on gold hairlines. */
export function TourHighlights({ items, label }: { items: string[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.slice(0, 6).map((item) => (
        <li key={item} className="border-t border-gold pt-4 font-serif text-h4 font-semibold md:text-h4-lg">
          {item}
        </li>
      ))}
    </ul>
  );
}
