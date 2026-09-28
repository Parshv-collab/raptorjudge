import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard, SkeletonTable } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Mail } from "lucide-react";

/** "3 days" / "1 day" / "today" — human copy for the invite countdown. */
function daysLeft(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "0 days";
  const days = Math.ceil(ms / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function AdminInvites() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;
  const invites = useQuery(api.admin.listInvites, skip ? "skip" : {});
  const createInvite = useMutation(api.admin.createInvite);
  const revokeInvite = useMutation(api.admin.revokeInvite);
  const regenerateInvite = useMutation(api.admin.regenerateInvite);

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
      toast.success("Invite created.");
      setEmail("");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    try {
      await revokeInvite({ inviteId: inviteId as any });
      toast.success("Invite revoked.");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    }
  }

  /** Issue 24: mint a fresh link for an expired invite in one click. */
  async function handleRegenerate(inviteId: string) {
    try {
      const res = await regenerateInvite({ inviteId: inviteId as any });
      setLastCreatedUrl(`${window.location.origin}${res.url}`);
      toast.success("Invite regenerated — a new link was issued.");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied to clipboard.");
    } catch {
      toast.error("Copy failed — select the link manually.");
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonTable rows={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff invites"
        description="Grant organizer, judge or admin access with single-use tokens."
      />

      {/* Create invite */}
      <div className="bg-surface-1 border border-line rounded-card p-6">
        <h2 className="text-h3 text-primary mb-4">Create invite</h2>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1 w-full">
            <Input
              label="Recipient email (optional)"
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
                { value: "participant", label: "Participant" },
              ]}
              value={role}
              onChange={(v) => setRole(v)}
            />
          </div>
          <Button variant="primary" isLoading={busy} type="submit">
            Generate invite
          </Button>
        </form>

        {lastCreatedUrl && (
          <div className="mt-5 p-4 rounded-card bg-success/5 border border-success/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-success">Invite URL generated</p>
              <p className="text-[13px] font-mono text-secondary break-all mt-0.5">{lastCreatedUrl}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => handleCopy(lastCreatedUrl)} className="shrink-0">
              Copy link
            </Button>
          </div>
        )}
      </div>

      {/* Pending invites */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h2 text-primary">Pending invites</h2>

        {invites === undefined ? (
          <SkeletonTable rows={4} />
        ) : invites.length === 0 ? (
          <EmptyState
            icon={<Mail />}
            title="No pending invites"
            description="Generate an invite above to grant staff access. Unused invites expire automatically."
          />
        ) : (
          <Table caption="Pending invites">
            <THead>
              <tr>
                <TH>Recipient</TH>
                <TH>Role</TH>
                <TH>Created by</TH>
                <TH>Expires</TH>
                <TH numeric>Actions</TH>
              </tr>
            </THead>
            <tbody>
              {invites.map((inv: any) => (
                <TR key={inv.id}>
                  <TD>
                    <span className="font-medium">{inv.email || "Open link"}</span>
                  </TD>
                  <TD>
                    <Badge variant={inv.role === "admin" ? "accent" : "default"}>{inv.role}</Badge>
                  </TD>
                  <TD>
                    <span className="text-secondary">{inv.createdBy}</span>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="tnum text-secondary">
                        {formatDate(inv.expiresAt)}
                      </span>
                      {inv.expired ? (
                        <Badge variant="danger">Expired</Badge>
                      ) : (
                        <span className="tnum text-[12px] text-muted">
                          Expires in {daysLeft(inv.expiresAt)}
                        </span>
                      )}
                    </div>
                  </TD>
                  <TD numeric>
                    <div className="flex justify-end gap-2">
                      {inv.expired && (
                        <Button variant="secondary" size="sm" onClick={() => handleRegenerate(inv.id)}>
                          Regenerate
                        </Button>
                      )}
                      <Button variant="danger" size="sm" onClick={() => handleRevoke(inv.id)}>
                        Revoke
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
