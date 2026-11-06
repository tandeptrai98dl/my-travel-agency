import { Mail, MessageCircle, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { ContactSettings } from "@/modules/settings/settings.schemas";

type Props = { contact: ContactSettings | null };

function digits(value: string): string {
  return value.replace(/[^\d]/g, "");
}

const buttonClass =
  "flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors duration-200 hover:border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Floating hotline, Zalo and WhatsApp links (FEATURES.md), each shown only when set in
 * `settings.contact`. Hidden on small screens while the cookie banner is open (globals.css).
 */
export async function ContactFloatingButton({ contact }: Props) {
  if (!contact) return null;
  const t = await getTranslations("Contact");
  const links = [
    contact.phone && {
      href: `tel:${contact.phone.replace(/[^\d+]/g, "")}`,
      label: t("hotline", { phone: contact.phone }),
      icon: <Phone className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />,
    },
    contact.zalo && {
      href: `https://zalo.me/${digits(contact.zalo)}`,
      label: `${t("zalo")} (${t("newTab")})`,
      icon: <span className="text-[0.6875rem] font-semibold tracking-wide">Zalo</span>,
    },
    contact.whatsapp && {
      href: `https://wa.me/${digits(contact.whatsapp)}`,
      label: `${t("whatsapp")} (${t("newTab")})`,
      icon: <MessageCircle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />,
    },
    !contact.phone &&
      contact.email && {
        href: `mailto:${contact.email}`,
        label: t("email"),
        icon: <Mail className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />,
      },
  ].filter((link): link is { href: string; label: string; icon: React.ReactElement } => Boolean(link));

  if (links.length === 0) return null;

  return (
    <nav aria-label={t("label")} className="floating-contact fixed bottom-4 right-4 z-30 md:bottom-6 md:right-6">
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className={buttonClass}
              aria-label={link.label}
              title={link.label}
              {...(link.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {link.icon}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
