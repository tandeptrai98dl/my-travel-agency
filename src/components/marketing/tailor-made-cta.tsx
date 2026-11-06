import { getTranslations } from "next-intl/server";

import { Section } from "@/components/layout/section";
import { ResponsiveImage } from "@/components/media/responsive-image";
import { Eyebrow } from "@/components/typography/eyebrow";
import { buttonVariants } from "@/components/ui/button-variants";
import { Link } from "@/i18n/navigation";
import { features } from "@/lib/features";
import type { ImageData } from "@/lib/images";
import type { Locale } from "@/modules/catalog/public/types";
import type { ContactSettings } from "@/modules/settings/settings.schemas";

type Props = { locale: Locale; contact: ContactSettings | null; image: ImageData | null };

/**
 * Tailor-made call to action on navy, split with a photo when one exists. Until the inquiry
 * wizard (Phase 5) and the contact page (PR K) exist, it offers the hotline and email from
 * settings (decision 9: no link to a missing route). Left out without either.
 */
export async function TailorMadeCta({ locale, contact, image }: Props) {
  const phone = contact?.phone ?? null;
  const email = contact?.email ?? null;
  if (!phone && !email && !features.contactPage) return null;
  const t = await getTranslations({ locale, namespace: "Home.tailorMade" });
  return (
    <Section tone="navy" spacing="none" contained={false} aria-labelledby="home-tailor-made">
      <div className="mx-auto grid max-w-7xl md:grid-cols-2">
        {image && (
          <div className="relative aspect-[3/2] md:aspect-auto md:min-h-[28rem]">
            <ResponsiveImage image={image} sizes="(min-width: 768px) 50vw, 100vw" fallback="none" />
          </div>
        )}
        <div className={image ? "flex flex-col justify-center gap-6 px-4 py-16 md:px-12 md:py-24" : "col-span-2 mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-16 text-center md:py-28"}>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 id="home-tailor-made" className="text-balance font-serif text-h2 font-medium md:text-h2-lg">
            {t("title")}
          </h2>
          <p className="max-w-prose text-body-lg text-muted-foreground">{t("text")}</p>
          <div className="flex flex-wrap gap-3">
            {features.contactPage && (
              <Link href="/contact" className={buttonVariants({ variant: "gold", size: "lg" })}>
                {t("contact")}
              </Link>
            )}
            {phone && (
              <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className={buttonVariants({ variant: features.contactPage ? "outline" : "gold", size: "lg" })}>
                {t("call", { phone })}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                {t("email")}
              </a>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
