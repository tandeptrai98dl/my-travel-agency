"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
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

type Props = {
  initialMode: Mode;
  messages: MfaSetupMessages;
  className?: string;
};

/**
 * TOTP enrolment and verification with Supabase Auth MFA. Verifying a code upgrades the session
 * to aal2 in place; the server then re-checks it on the next request (requireRole()).
 */
export function MfaSetup({ initialMode, messages, className }: Props) {
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
    const supabase = createClient();
    try {
      // Remove abandoned, never-verified factors so a fresh enrolment can start.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const factor of factors?.all ?? []) {
        if (factor.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
      const { data, error: enrolError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enrolError || !data) throw enrolError ?? new Error("enrol failed");
      setEnrolment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
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
    const supabase = createClient();
    try {
      let factorId = enrolment?.factorId;
      if (!factorId) {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        factorId = factors?.totp.find((factor) => factor.status === "verified")?.id;
      }
      if (!factorId) throw new Error("no factor");

      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (verifyError) {
        setError(messages.invalidCode);
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
