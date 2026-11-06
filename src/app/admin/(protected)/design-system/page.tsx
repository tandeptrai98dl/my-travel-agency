import { Search } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { RemovableTagDemo } from "@/components/admin/design-system/removable-tag-demo";
import {
  InteractiveShowcase,
  type ShowcaseLabels,
} from "@/components/admin/design-system/interactive-showcase";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading, headingVariants } from "@/components/typography/heading";
import { Price } from "@/components/typography/price";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Pagination } from "@/components/ui/pagination";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tag } from "@/components/ui/tag";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { designSystemEnabled } from "@/lib/env/flags";

import { requireAdminAccess } from "../../admin-gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.DesignSystem" });
  return { title: t("metaTitle") };
}

const COLOUR_TOKENS = [
  "background",
  "foreground",
  "card",
  "primary",
  "secondary",
  "muted-foreground",
  "accent",
  "border",
  "input",
  "ring",
  "success",
  "warning",
  "destructive",
] as const;

const TYPE_STYLES = ["display", "h1", "h2", "h3", "h4"] as const;
const BODY_STYLES = [
  ["Body L", "text-body-lg"],
  ["Body", "text-body"],
  ["Small", "text-small"],
] as const;
const BUTTON_VARIANTS = ["default", "gold", "secondary", "outline", "ghost", "link", "destructive"] as const;
const BADGE_VARIANTS = ["default", "secondary", "outline", "gold", "success", "warning", "destructive"] as const;

/**
 * Visual review of every token and component (spec step 13). Staff only (the protected layout
 * and the check below); in a production build it exists only when SHOW_DESIGN_SYSTEM=true (CI).
 */
export default async function DesignSystemPage() {
  if (!designSystemEnabled()) notFound();
  await requireAdminAccess(STAFF_ROLES);
  const t = await getTranslations({ locale: "vi", namespace: "Admin.DesignSystem" });

  const keys = [
    "forms", "overlays", "name", "email", "message", "messageHint", "destination",
    "chooseDestination", "travelStyle", "styleSlow", "styleActive", "newsletter", "submit",
    "errorRequired", "errorEmail", "saved", "savedBody", "failed", "showToast", "showError",
    "openDialog", "openSheet", "dialogTitle", "dialogBody", "tooltip", "tooltipBody", "popover",
    "popoverBody", "tabOne", "tabTwo", "tabOneBody", "tabTwoBody", "faq", "faqBody", "close",
    "switchDemo", "notification",
  ] as const;
  const labels = {
    ...Object.fromEntries(keys.map((key) => [key, t(key)])),
    // Radix fills in the hotkey; keep the placeholder literal.
    notifications: t("notifications", { hotkey: "{hotkey}" }),
    // Sample options for the review page only; real forms load destinations from Supabase.
    destinations: [
      { key: "ha-long-bay", name: "Vịnh Hạ Long" },
      { key: "hoi-an", name: "Hội An" },
      { key: "kyoto", name: "Kyoto" },
    ],
  } as ShowcaseLabels;

  return (
    <div className="bg-background text-foreground">
      <Container className="flex flex-col gap-16 py-12">
        <header className="flex flex-col gap-3">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <Heading level={1} size="h1">
            {t("title")}
          </Heading>
          <p className="max-w-2xl text-body-lg text-muted-foreground">{t("intro")}</p>
        </header>

        <section aria-labelledby="ds-colours" className="flex flex-col gap-6">
          <h2 id="ds-colours" className="font-serif text-h2 font-medium">
            {t("colours")}
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {COLOUR_TOKENS.map((token) => (
              <li key={token} className="flex flex-col gap-2">
                <span
                  aria-hidden="true"
                  className="h-16 rounded-lg border border-border"
                  style={{ backgroundColor: `hsl(var(--${token}))` }}
                />
                <code className="text-small">--{token}</code>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="ds-type" className="flex flex-col gap-6">
          <h2 id="ds-type" className="font-serif text-h2 font-medium">
            {t("typography")}
          </h2>
          {TYPE_STYLES.map((size) => (
            <div key={size} className="flex flex-col gap-1">
              <code className="text-small text-muted-foreground">{size}</code>
              <p className={headingVariants({ size })}>{t("sample")}</p>
            </div>
          ))}
          {BODY_STYLES.map(([name, className]) => (
            <div key={name} className="flex flex-col gap-1">
              <code className="text-small text-muted-foreground">{name}</code>
              <p className={className}>{t("sample")}</p>
            </div>
          ))}
          <Eyebrow>{t("sample")}</Eyebrow>
          <div className="flex flex-col gap-1">
            <code className="text-small text-muted-foreground">{t("price")}</code>
            <Price amount={45_900_000} locale="vi" prefix={t("from")} suffix={t("perPerson")} size="lg" />
          </div>
        </section>

        <section aria-labelledby="ds-buttons" className="flex flex-col gap-6">
          <h2 id="ds-buttons" className="font-serif text-h2 font-medium">
            {t("buttons")}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {BUTTON_VARIANTS.map((variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">sm</Button>
            <Button>default</Button>
            <Button size="lg">lg</Button>
            <Button disabled>disabled</Button>
            <IconButton label={t("search")} icon={<Search strokeWidth={1.5} />} variant="outline" />
            <IconButton label={t("search")} icon={<Search strokeWidth={1.5} />} size="sm" />
          </div>
        </section>

        <section aria-labelledby="ds-badges" className="flex flex-col gap-6">
          <h2 id="ds-badges" className="font-serif text-h2 font-medium">
            {t("badges")}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {BADGE_VARIANTS.map((variant) => (
              <Badge key={variant} variant={variant}>
                {variant}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge kind="booking" status="confirmed" label={t("statusConfirmed")} />
            <StatusBadge kind="booking" status="pending_payment" label={t("statusPending")} />
            <StatusBadge kind="booking" status="cancelled" label={t("statusCancelled")} />
            <StatusBadge kind="departure" status="guaranteed" label={t("statusGuaranteed")} />
            <Tag>Hội An</Tag>
            <RemovableTagDemo label="Kyoto" removeLabel={t("remove", { name: "Kyoto" })} />
          </div>
        </section>

        <InteractiveShowcase labels={labels} />

        <section aria-labelledby="ds-feedback" className="flex flex-col gap-6">
          <h2 id="ds-feedback" className="font-serif text-h2 font-medium">
            {t("feedback")}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Alert variant="warning">
              <AlertTitle>{t("alertTitle")}</AlertTitle>
              <AlertDescription>{t("alertBody")}</AlertDescription>
            </Alert>
            <Alert variant="destructive" live="assertive">
              <AlertTitle>{t("failed")}</AlertTitle>
              <AlertDescription>{t("errorRequired")}</AlertDescription>
            </Alert>
          </div>
          <div className="flex items-center gap-6">
            <Spinner label={t("loading")} />
            <Avatar>
              <AvatarFallback>NT</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col gap-2" aria-hidden="true">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <Separator />
          <EmptyState
            headingLevel={3}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            icon={<Search strokeWidth={1.5} />}
            action={<Button variant="outline">{t("emptyAction")}</Button>}
          />
        </section>

        <section aria-labelledby="ds-navigation" className="flex flex-col gap-6">
          <h2 id="ds-navigation" className="font-serif text-h2 font-medium">
            {t("navigation")}
          </h2>
          <Pagination
            page={4}
            pageCount={12}
            hrefFor={(page) => `/admin/design-system?page=${page}`}
            labels={{
              nav: t("pagination"),
              previous: t("previous"),
              next: t("next"),
              page: (page) => t("page", { page }),
            }}
          />
        </section>
      </Container>

      <Section tone="navy" aria-labelledby="ds-navy">
        <div className="flex flex-col gap-6">
          <Eyebrow>{t("navySection")}</Eyebrow>
          <Heading level={2} size="h2" id="ds-navy">
            {t("sample")}
          </Heading>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="gold">gold</Button>
            <Button variant="outline">outline</Button>
            <Button variant="link">link</Button>
            <Badge variant="success">success</Badge>
            <Badge variant="warning">warning</Badge>
            <Badge variant="destructive">destructive</Badge>
          </div>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
      </Section>
    </div>
  );
}

