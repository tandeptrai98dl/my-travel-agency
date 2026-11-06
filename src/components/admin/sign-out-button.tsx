import { Button } from "@/components/ui/button";

type Props = { label: string; action: () => Promise<void> };

/** Sign-out form; the action is a Server Action passed in by the page. */
export function SignOutButton({ label, action }: Props) {
  return (
    <form action={action}>
      <Button type="submit">{label}</Button>
    </form>
  );
}
