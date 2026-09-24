import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
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
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <GlassCard className="p-8 flex flex-col gap-4 items-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center font-bold text-xl">
            ✕
          </div>
          <h1 className="text-xl font-bold text-[#1d1d1f]">Invalid or Expired Invite</h1>
          <p className="text-xs text-[#6e6e73]">
            This invite link is invalid, has already been used, or has expired.
          </p>
          <Link to="/auth">
            <Button variant="primary" size="md">
              Go to Sign In →
            </Button>
          </Link>
        </GlassCard>
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
      await acceptInvite({ token: token! });
      await signIn("password", {
        email: targetEmail,
        password,
        name,
        flow: "signUp",
      });
      toast.success("Account created and invite accepted!");
      navigate("/home", { replace: true });
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto py-12 px-4 flex flex-col items-center">
      <GlassCard className="w-full p-8 flex flex-col gap-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            Staff Invitation
          </span>
          <h1 className="text-2xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
            Accept Invitation ({invite.role})
          </h1>
          <p className="text-xs text-[#6e6e73] mt-1">
            Set up your credentials to join RaptorJudge as {invite.role}.
          </p>
        </div>

        <form onSubmit={handleAccept} className="flex flex-col gap-4">
          <Input
            label="Full Name *"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ada Lovelace"
          />

          <Input
            label="Email Address *"
            type="email"
            required
            disabled={!!invite.email}
            value={invite.email || email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain.com"
          />

          <PasswordInput
            label="Set Password *"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />

          <PasswordInput
            label="Confirm Password *"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
          />

          <Button type="submit" variant="primary" size="md" isLoading={busy} className="mt-2 w-full">
            Complete Setup & Join →
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}
