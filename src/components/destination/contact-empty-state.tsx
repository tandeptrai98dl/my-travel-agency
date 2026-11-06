import { buttonVariants } from "@/components/ui/button-variants";
import type { ContactSettings } from "@/modules/settings/settings.schemas";

type Props = { text: string; callLabel: (phone: string) => string; emailLabel: string; contact: ContactSettings | null };

/**
 * No tours here yet: an invitation to ask for a tailor-made journey, with the hotline and email
 * from settings until the contact page and inquiry wizard exist (decision 9).
 */
export function ContactEmptyState({ text, callLabel, emailLabel, contact }: Props) {
  const phone = contact?.phone ?? null;
  const email = contact?.email ?? null;
  return (
    <div className="flex max-w-2xl flex-col items-start gap-5 rounded-lg border border-border bg-card p-6 md:p-8">
      <p className="text-body-lg">{text}</p>
      {(phone || email) && (
        <div className="flex flex-wrap gap-3">
          {phone && (
            <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className={buttonVariants()}>
              {callLabel(phone)}
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className={buttonVariants({ variant: "outline" })}>
              {emailLabel}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
