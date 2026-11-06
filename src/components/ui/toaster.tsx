"use client";

import * as React from "react";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./toast";

export type ToastMessage = {
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
};
type Entry = ToastMessage & { id: number; open: boolean };

// A tiny module-level store: `toast()` can be called from any client component or after a
// Server Action resolves, and the single <Toaster /> renders the queue.
let entries: Entry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const MAX_TOASTS = 3;

export function toast(message: ToastMessage): number {
  const id = nextId++;
  entries = [...entries, { ...message, id, open: true }].slice(-MAX_TOASTS);
  emit();
  return id;
}

function dismiss(id: number) {
  entries = entries.map((entry) => (entry.id === id ? { ...entry, open: false } : entry));
  emit();
  // Leave time for the exit transition, then drop it.
  setTimeout(() => {
    entries = entries.filter((entry) => entry.id !== id);
    emit();
  }, 300);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => entries;
// Must be a stable reference, or React re-renders forever during hydration.
const NO_TOASTS: Entry[] = [];
const getServerSnapshot = () => NO_TOASTS;

type Props = {
  /** Translated labels: close button and the viewport's landmark ("Notifications ({hotkey})"). */
  closeLabel: string;
  regionLabel: string;
};

/** Renders queued toasts. Mount once per root layout that uses `toast()`. */
export function Toaster({ closeLabel, regionLabel }: Props) {
  const queue = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <ToastProvider duration={6000} label={regionLabel}>
      {queue.map(({ id, open, title, description, variant }) => (
        <Toast
          key={id}
          open={open}
          variant={variant}
          // Errors are announced assertively; confirmations politely.
          type={variant === "destructive" ? "foreground" : "background"}
          onOpenChange={(next) => {
            if (!next) dismiss(id);
          }}
        >
          <div className="flex flex-col gap-1">
            <ToastTitle>{title}</ToastTitle>
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          <ToastClose label={closeLabel} />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
