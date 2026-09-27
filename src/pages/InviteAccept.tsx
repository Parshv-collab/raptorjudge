import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { humanizeConvexError } from "@/lib/errors";

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { signIn } = useAuthActions();

  const invite = useQuery(api.admin.getInviteByToken, token ? { token } : "skip");
  const acceptInvite = useMutation(api.admin.acceptInvite);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (invite === undefined) {
    return (
      <div className="max-w-md mx-auto py-12">
        <SkeletonCard lines={3} />
      </div>
    );
  }

  if (invite === null) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border border-danger/40 bg-danger/10 text-danger flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-h3 text-primary">Invalid or expired invite</h1>
        <p className="text-[13px] text-secondary leading-relaxed">
          This invite link is invalid, has already been used, or has expired.
        </p>
        <Link to="/auth">
          <Button variant="primary" size="md">
            Go to sign in
          </Button>
        </Link>
      </div>
    );
  }

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const targetEmail = invite?.email || email;
      // Create the account first: `acceptInvite` attaches the invited role to
      // the signed-in identity server-side, so it must run after sign-up. If the
      // address already has an account, fall back to signing in with it.
      try {
        await signIn("password", {
          email: targetEmail,
          password,
          name,
          flow: "signUp",
        });
      } catch (signUpError) {
        await signIn("password", {
          email: targetEmail,
          password,
          flow: "signIn",
        });
      }
      const accepted = await acceptInvite({ token: token! });
      toast.success(`Invite accepted — you are now ${accepted.role === "organizer" ? "an" : "a"} ${accepted.role}.`);
      navigate("/home", { replace: true });
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="bg-surface-1 border border-line rounded-card p-8 flex flex-col gap-6">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">Staff invitation</span>
          <h1 className="text-h2 text-primary mt-1">Accept invitation ({invite.role})</h1>
          <p className="text-[13px] text-secondary mt-1.5">
            Set up your credentials to join RaptorJudge as {invite.role}.
          </p>
        </div>

        <form onSubmit={handleAccept} className="flex flex-col gap-4">
          <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />

          <Input
            label="Email address"
            type="email"
            required
            disabled={!!invite.email}
            value={invite.email || email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain.com"
          />

          <PasswordInput
            label="Set password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />

          <PasswordInput
            label="Confirm password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
          />

          <Button type="submit" variant="primary" size="md" isLoading={busy} className="mt-1 w-full">
            Complete setup & join
          </Button>
        </form>
      </div>
    </div>
  );
}
