import type { Database } from "@/types/database.types";

import { Badge, type BadgeProps } from "./badge";

type Enums = Database["public"]["Enums"];
export type StatusKind = "booking" | "payment" | "departure" | "inquiry" | "transaction" | "publish" | "review";
type StatusOf = {
  booking: Enums["booking_status"];
  payment: Enums["booking_payment_state"];
  departure: Enums["departure_status"];
  inquiry: Enums["inquiry_status"];
  transaction: Enums["transaction_status"];
  publish: Enums["publish_status"];
  review: Enums["review_status"];
};
type Variant = NonNullable<BadgeProps["variant"]>;

// Colour carries meaning only together with the text label (WCAG 1.4.1).
const VARIANTS: { [K in StatusKind]: Record<StatusOf[K], Variant> } = {
  booking: {
    draft: "outline",
    quoted: "secondary",
    pending_payment: "warning",
    confirmed: "success",
    completed: "default",
    cancelled: "destructive",
    expired: "outline",
  },
  payment: {
    unpaid: "outline",
    deposit_paid: "warning",
    paid: "success",
    partially_refunded: "secondary",
    refunded: "secondary",
  },
  departure: { open: "success", guaranteed: "gold", closed: "secondary", cancelled: "destructive" },
  inquiry: {
    new: "gold",
    contacted: "secondary",
    quoted: "warning",
    won: "success",
    lost: "outline",
    spam: "outline",
  },
  transaction: {
    pending: "warning",
    succeeded: "success",
    failed: "destructive",
    expired: "outline",
    cancelled: "outline",
  },
  publish: {
    draft: "outline",
    published: "success",
    archived: "secondary",
  },
  review: { pending: "warning", approved: "success", rejected: "outline" },
};

export function statusVariant<K extends StatusKind>(kind: K, status: StatusOf[K]): Variant {
  return (VARIANTS[kind] as Record<string, Variant>)[status] ?? "outline";
}

type Props<K extends StatusKind> = {
  kind: K;
  status: StatusOf[K];
  /** Translated status label. */
  label: string;
  className?: string;
};

/** Booking, payment, departure, inquiry and transaction statuses with one consistent colour map. */
function StatusBadge<K extends StatusKind>({ kind, status, label, className }: Props<K>) {
  return (
    <Badge variant={statusVariant(kind, status)} className={className} data-status={status}>
      {label}
    </Badge>
  );
}

export { StatusBadge };
