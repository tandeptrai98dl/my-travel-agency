/** Placeholder of the listing while its first results load: filter column and 12 cards (§2.5). */
export function TourGridSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-10 lg:grid-cols-[264px_1fr] xl:grid-cols-[280px_1fr]">
      <div className="hidden flex-col gap-4 lg:flex" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <div className="flex flex-col gap-8" aria-hidden="true">
        <div className="h-11 animate-pulse rounded-md bg-muted" />
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 12 }, (_, index) => (
            <div key={index} className="flex flex-col gap-4">
              <div className="aspect-[4/5] animate-pulse bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-7 w-4/5 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
