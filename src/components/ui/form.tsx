"use client";

import type * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
  useFormState,
} from "react-hook-form";
import { z } from "zod";

import { cn } from "@/lib/utils";

import { Label } from "./label";

// Zod 4 probes `Function("")` on its first parse to decide whether to compile fast parsers. Under
// the nonce CSP of checkout, account and admin (no 'unsafe-eval', ADR-027) that probe is a CSP
// violation, so every form parses without it (same results, a little slower).
z.config({ jitless: true });

/**
 * React Hook Form + Zod wiring (shadcn new-york "form"). Use with
 * `useForm({ resolver: zodResolver(schema) })`. Zod messages are translation keys or already
 * translated strings; `FormMessage` takes `formatMessage` to map keys to text.
 */
const Form = FormProvider;

type FormFieldContextValue = { name: string };
const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  // Forms whose Zod schema transforms values (input type ≠ output type).
  TTransformedValues = TFieldValues,
>(props: ControllerProps<TFieldValues, TName, TTransformedValues>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

type FormItemContextValue = {
  id: string;
  hasDescription: boolean;
  setHasDescription: (value: boolean) => void;
};
const FormItemContext = React.createContext<FormItemContextValue | null>(null);

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  if (!fieldContext) throw new Error("useFormField must be used inside <FormField>");
  if (!itemContext) throw new Error("useFormField must be used inside <FormItem>");
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);
  const { id } = itemContext;
  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-item`,
    formDescriptionId: `${id}-description`,
    formMessageId: `${id}-message`,
    hasDescription: itemContext.hasDescription,
    setHasDescription: itemContext.setHasDescription,
    ...fieldState,
  };
}

const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const id = React.useId();
    const [hasDescription, setHasDescription] = React.useState(false);
    const value = React.useMemo(() => ({ id, hasDescription, setHasDescription }), [id, hasDescription]);
    return (
      <FormItemContext.Provider value={value}>
        <div ref={ref} className={cn("flex flex-col gap-2", className)} {...props} />
      </FormItemContext.Provider>
    );
  },
);
FormItem.displayName = "FormItem";

const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField();
  return (
    <Label ref={ref} className={cn(error && "text-destructive", className)} htmlFor={formItemId} {...props} />
  );
});
FormLabel.displayName = "FormLabel";

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId, hasDescription } = useFormField();
  // Only ids that exist on the page: the description when one is rendered, the message on error.
  const describedBy = [hasDescription && formDescriptionId, error && formMessageId].filter(Boolean).join(" ");
  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={describedBy || undefined}
      aria-invalid={!!error}
      {...props}
    />
  );
});
FormControl.displayName = "FormControl";

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId, setHasDescription } = useFormField();
  React.useEffect(() => {
    setHasDescription(true);
    return () => setHasDescription(false);
  }, [setHasDescription]);
  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-small text-muted-foreground", className)}
      {...props}
    />
  );
});
FormDescription.displayName = "FormDescription";

type FormMessageProps = Omit<React.HTMLAttributes<HTMLParagraphElement>, "translate"> & {
  /** Maps a Zod message (a translation key) to display text. */
  formatMessage?: (message: string) => string;
};

const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, children, formatMessage, ...props }, ref) => {
    const { error, formMessageId } = useFormField();
    const raw = error?.message ? String(error.message) : null;
    const body = raw ? (formatMessage ? formatMessage(raw) : raw) : children;
    // Always rendered, so the id referenced by aria-describedby exists and changes are announced.
    return (
      <p
        ref={ref}
        id={formMessageId}
        aria-live="polite"
        // Never display:none: a live region that starts hidden is announced unreliably.
        className={cn("text-small font-medium text-destructive empty:-mt-2", className)}
        {...props}
      >
        {body}
      </p>
    );
  },
);
FormMessage.displayName = "FormMessage";

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField };
