import { getTranslations } from "next-intl/server";

import { formatVnd } from "@/lib/money";
import { vietQrSvg } from "@/modules/payment/providers/vietqr";
import type { PaymentInstructions } from "@/modules/payment/provider";

import { CopyButton } from "./copy-button";

type Transfer = Extract<PaymentInstructions, { kind: "transfer" }>;

/** VietQR code rendered on the server (ADR-034), with the account, amount and memo to copy. */
export async function VietQrPanel({ transfer, locale }: { transfer: Transfer; locale: "vi" | "en" }) {
  const t = await getTranslations({ locale, namespace: "Checkout" });
  const svg = await vietQrSvg(transfer.payload);
  const amount = formatVnd(transfer.amount, locale);
  const rows: [string, string, string][] = [
    [t("bank"), transfer.bankBin, transfer.bankBin],
    [t("account"), transfer.accountNumber, transfer.accountNumber],
    [t("holder"), transfer.accountHolder, transfer.accountHolder],
    [t("amount"), amount, String(transfer.amount)],
    [t("memo"), transfer.memo, transfer.memo],
  ];
  return (
    <section aria-labelledby="transfer-title" className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6" data-testid="vietqr-panel">
      <h2 id="transfer-title" className="font-serif text-h3 font-semibold">
        {t("transferTitle")}
      </h2>
      <p className="text-small text-muted-foreground">{t("transferIntro")}</p>
      <div className="grid gap-6 sm:grid-cols-[12rem_1fr] sm:items-start">
        {/* The SVG comes from our own QR encoder (no user markup). */}
        <div role="img" aria-label={t("qrAlt", { amount })} className="w-48 bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <dl className="flex flex-col gap-3 text-small">
          {rows.map(([label, shown, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b border-border pb-2">
              <div>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{shown}</dd>
              </div>
              <CopyButton value={value} label={label} />
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
