import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, ShieldOff, Loader2, Copy } from "lucide-react";

/**
 * Account security settings (security item 55).
 *
 * TOTP is offered to admin and organizer accounts only — the roles that can
 * change roles, run judging assignments, issue certificates and export data.
 * Everything is local: the secret never leaves this deployment and no SMS /
 * e-mail / push provider is involved.
 *
 * Deliberately no QR-code library: this is an offline, zero-dependency install,
 * so the page shows the `otpauth://` URI (openable on a device that has an
 * authenticator) and the formatted manual key, which every authenticator app
 * accepts as a fallback.
 */
export default function Security() {
  const me = useQuery(api.users.me, {});
  const eligible = me?.role === "admin" || me?.role === "organizer";

  return (
    <div className="container max-w-3xl py-10">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <KeyRound size={20} />
        </span>
        <div>
          <h1 className="font-mono text-xl font-bold">Account security</h1>
          <div className="mono-label">two-factor authentication · self-hosted, offline</div>
        </div>
      </div>

      {me === undefined ? (
        <div className="font-mono text-sm text-muted-foreground animate-pulse">loading…</div>
      ) : !eligible ? (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-1 font-mono text-sm">Not available for your role</div>
          <p className="text-sm text-muted-foreground">
            Two-factor authentication is limited to <span className="font-mono">admin</span> and{" "}
            <span className="font-mono">organizer</span> accounts. Participants and judges sign in
            with a password only.
          </p>
        </div>
      ) : (
        <TotpPanel />
      )}
    </div>
  );
}

/** Split out so the TOTP query only runs for eligible roles. */
function TotpPanel() {
  const status = useQuery(api.mfa.status, {});
  const enroll = useMutation(api.mfa.enroll);
  const confirm = useMutation(api.mfa.confirm);
  const disable = useMutation(api.mfa.disable);

  const [enrollment, setEnrollment] = useState<{
    otpauthUri: string;
    secretForManualEntry: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function startEnrollment() {
    setBusy(true);
    try {
      const result = await enroll({});
      setEnrollment(result);
      setCode("");
      toast.success("Scan or save the key, then confirm with a live code");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not start enrolment");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrollment() {
    setBusy(true);
    try {
      await confirm({ code });
      setEnrollment(null);
      setCode("");
      toast.success("Two-factor authentication enabled");
    } catch (err: any) {
      toast.error(err?.message ?? "That code was not accepted");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await disable({ code });
      setCode("");
      toast.success("Two-factor authentication disabled");
    } catch (err: any) {
      toast.error(err?.message ?? "That code was not accepted");
    } finally {
      setBusy(false);
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-2 flex items-center gap-2">
          {status?.enabled ? (
            <ShieldCheck size={16} className="text-primary" />
          ) : (
            <ShieldOff size={16} className="text-muted-foreground" />
          )}
          <span className="font-mono text-sm font-semibold">
            {status === undefined
              ? "checking…"
              : status.enabled
                ? "Two-factor authentication is ON"
                : "Two-factor authentication is OFF"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          A 6-digit code from an authenticator app (Google Authenticator, 1Password, Aegis, …) is
          required after your password. Codes rotate every {status?.stepSeconds ?? 30}s and one step
          of clock skew is tolerated. Repeated wrong codes lock the factor for{" "}
          {Math.round((status?.lockoutMs ?? 300000) / 60000)} minutes.
        </p>
        {status?.enrolledAt && (
          <div className="mt-3 font-mono text-[11px] text-muted-foreground">
            enrolled {new Date(status.enrolledAt).toLocaleString()}
            {status.lastVerifiedAt
              ? ` · last verified ${new Date(status.lastVerifiedAt).toLocaleString()}`
              : ""}
          </div>
        )}
      </div>

      {!status?.enabled && !enrollment && (
        <button
          onClick={startEnrollment}
          disabled={busy || status === undefined}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 font-mono text-sm font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          enable two-factor
        </button>
      )}

      {enrollment && (
        <div className="grid gap-3 rounded-lg border border-primary/40 bg-card p-5">
          <div className="mono-label">step 1 · add this key to your authenticator</div>
          <div className="rounded-md border border-border bg-muted px-3 py-2">
            <div className="font-mono text-sm tracking-wider">
              {enrollment.secretForManualEntry}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => copy(enrollment.secretForManualEntry)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/50 hover:text-primary"
            >
              <Copy size={12} /> copy key
            </button>
            <button
              onClick={() => copy(enrollment.otpauthUri)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/50 hover:text-primary"
            >
              <Copy size={12} /> copy otpauth uri
            </button>
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider">
              otpauth uri
            </summary>
            <code className="mt-2 block break-all font-mono text-[11px]">
              {enrollment.otpauthUri}
            </code>
          </details>

          <div className="mono-label mt-2">step 2 · confirm with a live code</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-36 rounded-md border border-input bg-background px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={confirmEnrollment}
              disabled={busy || code.length !== 6}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              confirm
            </button>
            <button
              onClick={() => {
                setEnrollment(null);
                setCode("");
              }}
              className="rounded-md border border-border px-3 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
            >
              cancel
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Nothing is enforced until you confirm, so a mis-scanned key can never lock you out.
          </p>
        </div>
      )}

      {status?.enabled && (
        <div className="grid gap-3 rounded-lg border border-border bg-card p-5">
          <div className="mono-label">turn off · requires a current code</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-36 rounded-md border border-input bg-background px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={turnOff}
              disabled={busy || code.length !== 6}
              className="flex items-center gap-2 rounded-md border border-destructive/50 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              disable two-factor
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Lost your authenticator? Another admin can clear the factor for your account
            (<span className="font-mono">mfa.adminReset</span>); every reset is written to the audit
            log.
          </p>
        </div>
      )}
    </div>
  );
}
