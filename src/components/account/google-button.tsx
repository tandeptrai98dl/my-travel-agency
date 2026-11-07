import { buttonVariants } from "@/components/ui/button-variants";
import { cx } from "@/lib/cx";
import { startGoogleAction } from "@/modules/identity/customer-auth.actions";

/** "Continue with Google": a form posting to the Server Action, shown only when configured. */
export function GoogleButton({ locale, next, label }: { locale: "vi" | "en"; next: string; label: string }) {
  return (
    <form action={startGoogleAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
      <button type="submit" className={cx(buttonVariants({ variant: "secondary", size: "lg" }), "w-full")}>
        {label}
      </button>
    </form>
  );
}
