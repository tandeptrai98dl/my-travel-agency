"use client";

import { useRouter } from "next/navigation";
import { Component, type ReactNode, useTransition } from "react";

import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; message: string; retryLabel: string };

function Fallback({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="status" className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-6">
      <p className="text-body">{message}</p>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            onRetry();
            router.refresh();
          })
        }
      >
        {retryLabel}
      </Button>
    </div>
  );
}

/**
 * Keeps a failed live section (departures, the booking box) from taking the page down: the rest
 * stays and the section offers a retry (Phase 3 spec decision 12).
 */
export class DeparturesErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("live tour section failed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Fallback
        message={this.props.message}
        retryLabel={this.props.retryLabel}
        onRetry={() => this.setState({ failed: false })}
      />
    );
  }
}
