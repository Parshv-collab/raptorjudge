import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { QrCode } from "@/components/ui/QrCode";

export default function Security() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const me = useQuery(api.users.me, skip ? "skip" : {});
  const eligible = me?.role === "admin" || me?.role === "organizer";

  if (authLoading) return <SkeletonCard lines={3} />;
  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <PageHeader
        title="Security"
        description="Two-factor authentication for privileged accounts."
      />

      {me === undefined ? (
        <SkeletonCard lines={3} />
      ) : !eligible ? (
        <div className="bg-surface-1 border border-line rounded-card p-6">
          <h3 className="text-[15px] font-medium text-primary">Two-factor authentication not available</h3>
          <p className="text-[13px] text-secondary mt-1 leading-relaxed">
            TOTP second factors are restricted to{" "}
            <Badge variant="accent">admin</Badge> and <Badge variant="success">organizer</Badge>{" "}
            accounts. Participant and judge accounts sign in with password credentials only.
          </p>
        </div>
      ) : (
        <TotpPanel />
      )}
    </div>
  );
}

function TotpPanel() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const status = useQuery(api.mfa.status, skip ? "skip" : {});
  const enroll = useMutation(api.mfa.enroll);
  const confirm = useMutation(api.mfa.confirm);
  const disable = useMutation(api.mfa.disable);

  const [enrollment, setEnrollment] = useState<{
    otpauthUri: string;
    secretForManualEntry: string;
    secretRaw?: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function startEnrollment() {
    setBusy(true);
    try {
      const result = await enroll({});
      setEnrollment(result);
      setCode("");
      toast.success("Enrollment key generated. Confirm with a code from your app.");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
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
      toast.success("Two-factor authentication enabled.");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await disable({ code });
      setCode("");
      toast.success("Two-factor authentication disabled.");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Copy failed.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Status card */}
      <div className="bg-surface-1 border border-line rounded-card p-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-h3 text-primary">
              {status === undefined
                ? "Checking status…"
                : status.enabled
                  ? "Two-factor authentication is active"
                  : "Two-factor authentication is off"}
            </h3>
            {status?.enabled && <Badge variant="success">Enabled</Badge>}
          </div>
          <p className="text-[13px] text-secondary mt-1">
            A 6-digit authenticator app code will be required when signing in.
          </p>
          {status?.enrolledAt && (
            <p className="font-mono text-[12px] text-muted mt-3 tnum">
              Enrolled {new Date(status.enrolledAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Enrollment entry point */}
      {!status?.enabled && !enrollment && (
        <div>
          <Button variant="primary" isLoading={busy} onClick={startEnrollment}>
            Enable two-factor authentication
          </Button>
        </div>
      )}

      {/* Enrollment flow */}
      {enrollment && (
        <div className="bg-surface-1 border border-accent/40 rounded-card p-6 flex flex-col gap-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
              Step 1 — add the key to your authenticator app
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-5 items-start">
              {/* Issue 28: camera enrolment — scan with Google Authenticator,
                  Aegis, 1Password, etc. The manual key below stays as fallback. */}
              <div className="p-2 bg-white rounded-input border border-line shrink-0">
                <QrCode value={enrollment.otpauthUri} size={168} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-secondary">
                  Scan this with your authenticator app, or enter the key manually:
                </p>
                <div className="mt-3 p-3.5 bg-surface-2 rounded-input border border-line font-mono text-[15px] tracking-[0.2em] text-primary select-all tnum break-all">
                  {enrollment.secretForManualEntry}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="secondary" size="sm" onClick={() => copy(enrollment.secretForManualEntry)}>
                    Copy key
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => copy(enrollment.otpauthUri)}>
                    Copy otpauth URI
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
              Step 2 — confirm with a code
            </p>
            <div className="flex gap-3 items-center mt-3">
              <Input
                aria-label="6-digit authenticator code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-36 text-center font-mono text-base tracking-[0.2em]"
              />
              <Button
                variant="primary"
                isLoading={busy}
                disabled={code.length !== 6}
                onClick={confirmEnrollment}
              >
                Confirm
              </Button>
              <Button variant="ghost" onClick={() => setEnrollment(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Disable flow */}
      {status?.enabled && (
        <div className="bg-danger/5 border border-danger/40 rounded-card p-6">
          <h4 className="text-[11px] font-medium uppercase tracking-[0.08em] text-danger">
            Disable two-factor authentication
          </h4>
          <p className="text-[13px] text-secondary mt-1.5 mb-4">
            Enter a live code from your authenticator app to turn TOTP off.
          </p>
          <div className="flex gap-3 items-center">
            <Input
              aria-label="6-digit authenticator code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-36 text-center font-mono text-base tracking-[0.2em]"
            />
            <Button
              variant="danger"
              isLoading={busy}
              disabled={code.length !== 6}
              onClick={turnOff}
            >
              Disable factor
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
