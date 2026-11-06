"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type MfaSetupMessages = {
  enrolIntro: string;
  secretLabel: string;
  verifyIntro: string;
  codeLabel: string;
  start: string;
  verify: string;
  verifying: string;
  invalidCode: string;
  genericError: string;
  done: string;
  continue: string;
  qrAlt: string;
};

type Mode = "enrol" | "verify" | "done";
type Enrolment = { factorId: string; qrCode: string; secret: string };

export type MfaActions = {
  start: () => Promise<({ ok: true } & Enrolment) | { ok: false; error: string }>;
  verify: (input: {
    code: string;
    factorId?: string;
  }) => Promise<{ ok: true } | { ok: false; error: "invalid_code" | "failed" }>;
};

type Props = {
  initialMode: Mode;
  messages: MfaSetupMessages;
  /** Server Actions from src/modules/identity, passed in by the page. */
  actions: MfaActions;
  className?: string;
};

/**
 * TOTP enrolment and verification UI. The work happens in Server Actions (Supabase Auth MFA on
 * the server); a verified code upgrades the session to aal2, which the server re-checks on the
 * next request (requireRole()).
 */
export function MfaSetup({ initialMode, messages, actions, className }: Props) {
  const router = useRouter();
  const codeId = useId();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startEnrolment() {
    setBusy(true);
    setError(null);
    try {
      const result = await actions.start();
      if (!result.ok) {
        setError(messages.genericError);
        return;
      }
      setEnrolment({ factorId: result.factorId, qrCode: result.qrCode, secret: result.secret });
    } catch {
      setError(messages.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await actions.verify({ code: code.trim(), factorId: enrolment?.factorId });
      if (!result.ok) {
        setError(result.error === "invalid_code" ? messages.invalidCode : messages.genericError);
        return;
      }
      setMode("done");
      router.refresh();
    } catch {
      setError(messages.genericError);
    } finally {
      setBusy(false);
    }
  }

  if (mode === "done") {
    return (
      <div className={cn("space-y-6", className)}>
        <p role="status">{messages.done}</p>
        <Button onClick={() => router.push("/admin")}>{messages.continue}</Button>
      </div>
    );
  }

  const showCodeForm = mode === "verify" || enrolment !== null;

  return (
    <div className={cn("space-y-6", className)}>
      {mode === "enrol" && !enrolment && (
        <Button onClick={startEnrolment} disabled={busy}>
          {messages.start}
        </Button>
      )}

      {enrolment && (
        <div className="space-y-4">
          <p className="text-sm">{messages.enrolIntro}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from Supabase */}
          <img src={enrolment.qrCode} alt={messages.qrAlt} width={192} height={192} />
          <div className="text-sm">
            <div className="text-muted-foreground">{messages.secretLabel}</div>
            <code data-testid="mfa-secret" className="break-all font-mono">
              {enrolment.secret}
            </code>
          </div>
        </div>
      )}

      {mode === "verify" && <p className="text-sm">{messages.verifyIntro}</p>}

      {showCodeForm && (
        <form onSubmit={verify} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={codeId}>{messages.codeLabel}</Label>
            <Input
              id={codeId}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? messages.verifying : messages.verify}
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
