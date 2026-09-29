import { useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useAction, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard, SkeletonTable } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Search, KeyRound } from "lucide-react";

const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "organizer", label: "Organizer" },
  { value: "judge", label: "Judge" },
  { value: "participant", label: "Participant" },
];

const ROLE_BADGE: Record<string, "accent" | "success" | "warning" | "default"> = {
  admin: "accent",
  organizer: "success",
  judge: "warning",
  participant: "default",
};

export default function AdminUsers() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;
  const users = useQuery(api.users.list, skip ? "skip" : {});
  const setRole = useMutation(api.users.setRole);
  const disableUser = useMutation(api.users.adminDisable);
  const enableUser = useMutation(api.users.adminEnable);
  const forceLogout = useMutation(api.users.adminForceLogout);
  const deleteUser = useMutation(api.users.adminDelete);
  const resetPassword = useAction(api.adminReset.adminResetPassword);
  // Clearing a lost 2FA device — without it an admin reset cannot restore
  // access, because the second factor is required after the password.
  const resetMfa = useMutation(api.mfa.adminReset);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [targetRole, setTargetRole] = useState("participant");
  const [busy, setBusy] = useState(false);

  // Password reset (self-hosted: no mail service, so an admin hands over a
  // temporary password out of band).
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [resetMode, setResetMode] = useState<"generate" | "custom">("generate");
  const [customPassword, setCustomPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetResult, setResetResult] = useState<{ email: string; tempPassword: string } | null>(null);
  // Deleting a user is irreversible, so it asks through the in-app dialog with
  // the email typed out rather than a browser confirm() popup.
  const [deleteTarget, setDeleteTarget] = useState<{ _id: any; email: string } | null>(null);

  async function handleResetMfa(user: any) {
    setBusy(true);
    try {
      await resetMfa({ userId: user._id });
      toast.success(
        `Second factor cleared for ${user.name || user.email}. They can enrol a new device from Security.`,
      );
    } catch (err) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    if (resetMode === "custom" && customPassword.trim().length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setResetBusy(true);
    try {
      const res = await resetPassword({
        userId: resetTarget._id,
        ...(resetMode === "custom" ? { newPassword: customPassword.trim() } : {}),
      });
      setResetResult({ email: res.email, tempPassword: res.tempPassword });
      toast.success(`Password reset for ${res.email}. Live sessions were signed out.`);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setResetBusy(false);
    }
  }

  function closeResetModal() {
    setResetTarget(null);
    setResetResult(null);
    setCustomPassword("");
    setResetMode("generate");
  }

  async function copyTempPassword() {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult.tempPassword);
      toast.success("Temporary password copied.");
    } catch {
      toast.error("Copy failed — select the password and copy it manually.");
    }
  }

  async function handleToggleDisable(u: any) {
    try {
      if (u.role) {
        await disableUser({ userId: u._id });
        toast.success("User disabled.");
      } else {
        await enableUser({ userId: u._id, role: "participant" });
        toast.success("User enabled.");
      }
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    }
  }

  async function handleForceLogout(u: any) {
    try {
      await forceLogout({ userId: u._id });
      toast.success(`Force logout executed for ${u.email}`);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteUser({ userId: deleteTarget._id });
      toast.success(`User ${deleteTarget.email} deleted.`);
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    }
  }

  const filteredUsers = useMemo(() => {
    return (users || []).filter((u: any) => {
      const matchRole = roleFilter === "all" || (u.role || "participant") === roleFilter;
      const matchSearch =
        !search ||
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase());
      return matchRole && matchSearch;
    });
  }, [users, roleFilter, search]);

  async function handleConfirmRoleChange() {
    if (!selectedUser) return;
    setBusy(true);
    try {
      await setRole({
        userId: selectedUser._id,
        role: targetRole as any,
      });
      toast.success(`Role updated to ${targetRole} for ${selectedUser.name || selectedUser.email}`);
      setSelectedUser(null);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || (skip && users === undefined)) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonTable rows={6} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform users"
        description="Role management and account controls for every registered account."
      />

      {/* Filter bar */}
      <div className="bg-surface-1 border border-line rounded-card p-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="w-full sm:flex-1">
          <Input
            aria-label="Search users"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Dropdown options={ROLE_OPTIONS} value={roleFilter} onChange={(v) => setRoleFilter(v)} />
        </div>
        <span className="text-[13px] text-muted tnum shrink-0">
          {filteredUsers.length} user{filteredUsers.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Users table */}
      {users === undefined ? (
        <SkeletonTable rows={6} />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No users found"
          description={
            users.length === 0
              ? "No accounts are registered yet. Invited staff and new signups will appear here."
              : "No accounts match the current search or role filter."
          }
        />
      ) : (
        <Table caption="Platform users">
          <THead>
            <tr>
              <TH>User</TH>
              <TH>Role</TH>
              <TH numeric>Actions</TH>
            </tr>
          </THead>
          <tbody>
            {filteredUsers.map((user: any) => (
              <TR key={user._id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={user.name || user.email} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{user.name || "—"}</p>
                      <p className="font-mono text-[12px] text-muted truncate">{user.email}</p>
                    </div>
                  </div>
                </TD>
                <TD>
                  {user.role ? (
                    <Badge variant={ROLE_BADGE[user.role] ?? "default"}>{user.role}</Badge>
                  ) : (
                    <Badge variant="danger">disabled</Badge>
                  )}
                </TD>
                <TD numeric>
                  <div className="flex gap-1.5 justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user);
                        setTargetRole(user.role || "participant");
                      }}
                    >
                      Role
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleToggleDisable(user)}>
                      {user.role ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleForceLogout(user)}>
                      Logout
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setResetResult(null);
                        setCustomPassword("");
                        setResetMode("generate");
                        setResetTarget(user);
                      }}
                    >
                      Reset password
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!user.totpEnabled}
                      title={
                        user.totpEnabled
                          ? "Clear the stored TOTP secret so the user can enrol a new device"
                          : "This user has no second factor enrolled"
                      }
                      onClick={() => handleResetMfa(user)}
                    >
                      Reset 2FA
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      aria-label={`Delete user ${user.email}`}
                      onClick={() => setDeleteTarget({ _id: user._id, email: user.email })}
                    >
                      Delete
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {/* Password reset modal */}
      <Modal
        isOpen={!!resetTarget}
        onClose={closeResetModal}
        title="Reset password"
        description={
          resetResult
            ? `Temporary password for ${resetResult.email}`
            : `Issue a new password for ${resetTarget?.name || resetTarget?.email}`
        }
      >
        {resetResult ? (
          <div className="flex flex-col gap-4 mt-2">
            <div className="flex items-start gap-3 p-3.5 rounded-input bg-surface-2 border border-line">
              <KeyRound size={16} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[15px] text-primary select-all break-all tnum">
                  {resetResult.tempPassword}
                </p>
                <p className="text-[12px] text-muted mt-1.5">
                  Shown once. Hand it to the user out of band; they can change it at /security.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={copyTempPassword}>
                Copy password
              </Button>
              <Button variant="primary" onClick={closeResetModal}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 mt-2">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-btn border border-line bg-surface-1">
              {(["generate", "custom"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setResetMode(m)}
                  className={`h-9 text-[13px] font-medium rounded-[4px] transition-colors duration-fast ${
                    resetMode === m ? "bg-surface-2 text-primary" : "text-secondary hover:text-primary"
                  }`}
                >
                  {m === "generate" ? "Generate one" : "Type one"}
                </button>
              ))}
            </div>

            {resetMode === "custom" && (
              <Input
                label="Temporary password"
                type="text"
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            )}

            <p className="text-[13px] text-secondary leading-relaxed">
              {resetMode === "generate"
                ? "A strong temporary password will be generated and shown once."
                : "The password you type is hashed by the auth provider — it is never stored in plaintext."}{" "}
              All active sessions for this account are signed out, and the reset is written to the
              audit log.
            </p>

            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={closeResetModal}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isLoading={resetBusy}
                disabled={resetMode === "custom" && customPassword.trim().length < 8}
                onClick={handleResetPassword}
              >
                Reset password
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Role change modal */}
      <Modal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="Change user role"
        description={`Modify access role for ${selectedUser?.name || selectedUser?.email}`}
      >
        <div className="flex flex-col gap-4 mt-2">
          <Dropdown
            label="New role"
            options={ROLE_OPTIONS.filter((r) => r.value !== "all")}
            value={targetRole}
            onChange={(v) => setTargetRole(v)}
          />

          <div className="flex justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => setSelectedUser(null)}>
              Cancel
            </Button>
            <Button variant="primary" isLoading={busy} onClick={handleConfirmRoleChange}>
              Confirm change
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete user"
        description={
          deleteTarget
            ? `Permanently delete ${deleteTarget.email}? Their teams, submissions and scores are removed with the account and this cannot be undone.`
            : ""
        }
        confirmLabel="Delete user"
        requireTyping={deleteTarget?.email}
        destructive
        isLoading={busy}
      />
    </div>
  );
}
