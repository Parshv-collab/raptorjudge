import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";

export default function AdminInvites() {
  const invites = useQuery(api.admin.listInvites, {});
  const createInvite = useMutation(api.admin.createInvite);
  const revokeInvite = useMutation(api.admin.revokeInvite);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("organizer");
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createInvite({ email: email.trim() || undefined, role });
      const fullUrl = `${window.location.origin}${res.url}`;
      setLastCreatedUrl(fullUrl);
      toast.success("Invite created successfully!");
      setEmail("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create invite");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    try {
      await revokeInvite({ inviteId: inviteId as any });
      toast.success("Invite revoked.");
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke invite");
    }
  }

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied to clipboard!");
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-6">
      <Link to="/admin">
        <span className="text-xs font-semibold text-[#ff0055] hover:underline">
          ← Back to Admin Dashboard
        </span>
      </Link>

      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
          Access Control
        </span>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
          Staff Invites
        </h1>
      </div>

      <GlassCard className="p-6">
        <h2 className="text-sm font-bold text-[#1d1d1f] mb-4">Create New Staff Invite</h2>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <Input
              label="Recipient Email (Optional)"
              type="email"
              placeholder="organizer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Dropdown
              label="Role"
              options={[
                { value: "organizer", label: "Organizer" },
                { value: "admin", label: "Admin" },
                { value: "judge", label: "Judge" },
              ]}
              value={role}
              onChange={(v) => setRole(v)}
            />
          </div>
          <Button variant="primary" size="md" isLoading={busy} type="submit">
            Generate Invite
          </Button>
        </form>

        {lastCreatedUrl && (
          <div className="mt-4 p-4 rounded-card bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-emerald-900">Invite URL Generated:</p>
              <p className="text-xs font-mono text-emerald-800 break-all">{lastCreatedUrl}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => handleCopy(lastCreatedUrl)}>
              Copy Link
            </Button>
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="text-sm font-bold text-[#1d1d1f] mb-4">Pending Invites</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/10 font-bold uppercase tracking-wider text-[#6e6e73]">
                <th className="py-3 px-4">Recipient Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Created By</th>
                <th className="py-3 px-4">Expires</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(invites || []).map((inv: any) => (
                <tr key={inv.id} className="border-b border-black/5 hover:bg-white/40">
                  <td className="py-3.5 px-4 font-bold text-[#1d1d1f]">{inv.email}</td>
                  <td className="py-3.5 px-4 font-semibold uppercase text-[10px] text-[#ff0055]">
                    {inv.role}
                  </td>
                  <td className="py-3.5 px-4 text-[#6e6e73]">{inv.createdBy}</td>
                  <td className="py-3.5 px-4 text-[#6e6e73]">
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 px-4 text-right flex gap-2 justify-end">
                    <Button variant="danger" size="sm" onClick={() => handleRevoke(inv.id)}>
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!invites || invites.length === 0) && (
            <p className="text-xs text-[#6e6e73] text-center py-6">No pending invites.</p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
