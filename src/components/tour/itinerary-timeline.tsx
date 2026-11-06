import { ResponsiveImage } from "@/components/media/responsive-image";
import type { ImageData } from "@/lib/images";

export type TimelineDay = {
  day: number;
  title: string;
  description: string;
  details: string[];
  image: ImageData | null;
};

/** Day-by-day itinerary: day number, title, description, meals and overnight, an optional image. */
export function ItineraryTimeline({ days, dayLabel }: { days: TimelineDay[]; dayLabel: string }) {
  return (
    <ol className="flex flex-col">
      {days.map((day, index) => (
        <li key={day.day} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4 md:grid-cols-[4.5rem_minmax(0,1fr)] md:gap-6">
          <div className="flex flex-col items-center gap-2" aria-hidden="true">
            <span className="text-eyebrow font-semibold uppercase text-muted-foreground">{dayLabel}</span>
            <span className="font-serif text-h2 font-medium leading-none md:text-h2-lg">{day.day}</span>
            {index < days.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <div className="flex flex-col gap-2 pb-8 md:pb-10">
            <h3 className="font-serif text-h3 font-semibold md:text-h3-lg">
              <span className="sr-only">
                {dayLabel} {day.day}:{" "}
              </span>
              {day.title}
            </h3>
            {day.description && <p className="max-w-prose text-body">{day.description}</p>}
            {day.details.length > 0 && <p className="text-small text-muted-foreground">{day.details.join(" · ")}</p>}
            {day.image && (
              <div className="relative mt-2 aspect-[3/2] w-full max-w-md overflow-hidden bg-muted">
                <ResponsiveImage image={day.image} sizes="(min-width: 768px) 448px, 100vw" />
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
