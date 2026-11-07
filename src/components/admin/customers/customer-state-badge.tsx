import { Badge } from "@/components/ui/badge";
import type { CustomerState } from "@/modules/account/customers-admin.schemas";

/** A customer's account state: active (plain text), deletion requested, or deleted. */
export function CustomerStateBadge({ state, label }: { state: CustomerState; label: string }) {
  if (state === "active") return <span className="text-small text-muted-foreground">{label}</span>;
  return <Badge variant={state === "requested" ? "warning" : "secondary"}>{label}</Badge>;
}
