import { Button, type ButtonProps } from "@/components/ui/button";

type Props = {
  label: string;
  action: () => Promise<void>;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
};

/** Sign-out form; the action is a Server Action passed in by the page. */
export function SignOutButton({ label, action, variant, size }: Props) {
  return (
    <form action={action}>
      <Button type="submit" variant={variant} size={size}>
        {label}
      </Button>
    </form>
  );
}
