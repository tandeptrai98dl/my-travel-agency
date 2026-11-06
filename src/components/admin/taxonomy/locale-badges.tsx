import { CheckCircle2, Circle, Minus } from "lucide-react";

type State = { exists: boolean; published: boolean };

/** VI/EN publication state in text and icon (never colour alone). */
export function LocaleBadges({
  locales,
  labels,
}: {
  locales: Record<"vi" | "en", State>;
  labels: { vi: string; en: string; published: string; unpublished: string; missing: string };
}) {
  return (
    <ul className="flex flex-wrap gap-3 text-small">
      {(["vi", "en"] as const).map((locale) => {
        const { exists, published } = locales[locale];
        const status = !exists ? labels.missing : published ? labels.published : labels.unpublished;
        const Icon = !exists ? Minus : published ? CheckCircle2 : Circle;
        return (
          <li key={locale} className="flex items-center gap-1">
            <Icon
              className={published ? "h-4 w-4 text-success" : "h-4 w-4 text-muted-foreground"}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="font-medium">{locale.toUpperCase()}</span>
            <span className="text-muted-foreground">{status}</span>
          </li>
        );
      })}
    </ul>
  );
}
