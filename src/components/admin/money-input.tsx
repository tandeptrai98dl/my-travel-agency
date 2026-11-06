"use client";

import { forwardRef, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { type Dong, formatDongInput, parseDongInput } from "@/lib/money";
import { cn } from "@/lib/utils";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: Dong | null;
  onChange: (value: Dong | null) => void;
  /** Currency shown after the field ("₫"); decorative, the label says "VND". */
  suffix?: string;
};

/**
 * Integer VND input (ADR-011): accepts "12900000", "12.900.000" or "12,900,000", shows groups
 * while typing is finished (on blur) and never produces decimals.
 */
export const MoneyInput = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, suffix = "₫", className, onBlur, ...props }, ref) => {
    const [text, setText] = useState(formatDongInput(value));
    useEffect(() => {
      // Follow outside changes (form reset) without fighting the user's typing.
      setText((current) => (parseDongInput(current) === value ? current : formatDongInput(value)));
    }, [value]);
    return (
      <div className={cn("relative", className)}>
        <Input
          ref={ref}
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onChange(parseDongInput(event.target.value));
          }}
          onBlur={(event) => {
            setText(formatDongInput(parseDongInput(event.target.value)));
            onBlur?.(event);
          }}
          className="pr-10 text-right tabular-nums"
          {...props}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-small text-muted-foreground">
          {suffix}
        </span>
      </div>
    );
  },
);
MoneyInput.displayName = "MoneyInput";
