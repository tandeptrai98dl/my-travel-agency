import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading } from "@/components/typography/heading";
import { Link } from "@/i18n/navigation";
import { cx } from "@/lib/cx";
import { signOutCustomerAction } from "@/modules/identity/customer-auth.actions";

type Section = "overview" | "bookings" | "profile";

const HREFS = { overview: "/account", bookings: "/account/bookings", profile: "/account/profile" } as const;

type Props = { locale: "vi" | "en"; current: Section | null; title: string; children: React.ReactNode };

/** Account pages: the page title, the account navigation (current page marked) and sign-out. */
export async function AccountFrame({ locale, current, title, children }: Props) {
  const t = await getTranslations({ locale, namespace: "Account" });
  return (
    <Container className="flex flex-col gap-10 py-12 md:py-16">
      <div className="flex flex-col gap-3">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <Heading level={1} size="h1">
          {title}
        </Heading>
      </div>
      <div className="grid gap-10 lg:grid-cols-[14rem_1fr]">
        <nav aria-label={t("nav.label")} className="flex flex-col gap-4">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-4 lg:flex-col lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
            {(Object.keys(HREFS) as Section[]).map((section) => (
              <li key={section}>
                <Link
                  href={HREFS[section]}
                  aria-current={current === section ? "page" : undefined}
                  className={cx(
                    "inline-flex min-h-11 items-center text-small underline-offset-[6px] hover:underline",
                    current === section ? "font-semibold underline decoration-gold decoration-2" : "text-muted-foreground",
                  )}
                >
                  {t(`nav.${section}`)}
                </Link>
              </li>
            ))}
            <li>
              <form action={signOutCustomerAction}>
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" className="inline-flex min-h-11 items-center text-small text-muted-foreground underline-offset-[6px] hover:underline">
                  {t("nav.signOut")}
                </button>
              </form>
            </li>
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-10">{children}</div>
      </div>
    </Container>
  );
}
