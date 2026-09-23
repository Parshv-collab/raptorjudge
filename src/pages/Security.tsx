import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function Security() {
  const me = useQuery(api.users.me, {});
  const eligible = me?.role === "admin" || me?.role === "organizer";

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Account Security</h1>
        <p className="text-xs text-[#6e6e73] mt-1">
          Configure two-factor authentication and review your security status
        </p>
      </div>

      {me === undefined ? (
        <div className="animate-pulse py-12 text-center text-xs text-[#6e6e73]">
          Loading security details...
        </div>
      ) : !eligible ? (
        <GlassCard className="p-6">
          <h3 className="text-sm font-bold text-[#1d1d1f] mb-1">
            Two-Factor Authentication Not Available
          </h3>
          <p className="text-xs text-[#6e6e73] leading-relaxed">
            Two-factor authentication (TOTP) is restricted to <span className="font-bold text-[#1d1d1f]">admin</span> and{" "}
            <span className="font-bold text-[#1d1d1f]">organizer</span> accounts. Participant and judge accounts sign in with password credentials.
          </p>
        </GlassCard>
      ) : (
        <TotpPanel />
      )}
    </div>
  );
}

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
      toast.success("Enrolment key generated. Confirm with code.");
    } catch (err: any) {
      toast.error(err?.message || "Could not start enrolment");
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
      toast.success("Two-factor authentication enabled!");
    } catch (err: any) {
      toast.error(err?.message || "Code not accepted");
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
      toast.error(err?.message || "Code not accepted");
    } finally {
      setBusy(false);
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2 rounded-xl ${status?.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-black/5 text-[#6e6e73]"}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#1d1d1f]">
              {status === undefined
                ? "Checking status..."
                : status.enabled
                ? "Two-Factor Authentication is Active"
                : "Two-Factor Authentication is Disabled"}
            </h3>
            <p className="text-xs text-[#6e6e73]">
              A 6-digit authenticator app code will be required when signing in.
            </p>
          </div>
        </div>

        {status?.enrolledAt && (
          <p className="text-[11px] font-mono text-[#6e6e73] mt-4 border-t border-black/5 pt-3">
            Enrolled: {new Date(status.enrolledAt).toLocaleString()}
          </p>
        )}
      </GlassCard>

      {!status?.enabled && !enrollment && (
        <Button variant="primary" size="md" isLoading={busy} onClick={startEnrollment}>
          Enable Two-Factor Authentication
        </Button>
      )}

      {enrollment && (
        <GlassCard className="p-6 border-[#ff0055]/30">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#ff0055] mb-3">
            Step 1 — Add key to authenticator app
          </h4>

          <div className="p-3 bg-white/80 rounded-input border border-white font-mono text-sm tracking-widest text-[#1d1d1f] mb-3">
            {enrollment.secretForManualEntry}
          </div>

          <div className="flex gap-2 mb-4">
            <Button variant="secondary" size="sm" onClick={() => copy(enrollment.secretForManualEntry)}>
              Copy Manual Key
            </Button>
            <Button variant="secondary" size="sm" onClick={() => copy(enrollment.otpauthUri)}>
              Copy URI
            </Button>
          </div>

          <h4 className="text-xs font-bold uppercase tracking-wider text-[#ff0055] mb-2 pt-2 border-t border-black/5">
            Step 2 — Confirm with code
          </h4>

          <div className="flex gap-2 items-center">
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-36 px-3 py-2 text-center font-mono text-base rounded-input bg-white/60 border border-white shadow-sm focus-ring-accent"
            />
            <Button
              variant="primary"
              size="md"
              isLoading={busy}
              disabled={code.length !== 6}
              onClick={confirmEnrollment}
            >
              Confirm
            </Button>
            <Button variant="ghost" size="md" onClick={() => setEnrollment(null)}>
              Cancel
            </Button>
          </div>
        </GlassCard>
      )}

      {status?.enabled && (
        <GlassCard className="p-6 border-red-200">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#e63946] mb-2">
            Disable Two-Factor Authentication
          </h4>
          <p className="text-xs text-[#6e6e73] mb-4">
            Enter a live code from your authenticator app to disable TOTP.
          </p>

          <div className="flex gap-2 items-center">
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-36 px-3 py-2 text-center font-mono text-base rounded-input bg-white/60 border border-white shadow-sm focus-ring-accent"
            />
            <Button
              variant="danger"
              size="md"
              isLoading={busy}
              disabled={code.length !== 6}
              onClick={turnOff}
            >
              Disable Factor
            </Button>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
