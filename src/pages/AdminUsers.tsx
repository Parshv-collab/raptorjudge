import { useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
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
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Search } from "lucide-react";

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

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [targetRole, setTargetRole] = useState("participant");
  const [busy, setBusy] = useState(false);

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

  async function handleDelete(u: any) {
    if (!confirm(`Permanently delete user ${u.email}? This cannot be undone.`)) return;
    try {
      await deleteUser({ userId: u._id });
      toast.success(`User ${u.email} deleted.`);
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
                    <Button variant="danger" size="sm" onClick={() => handleDelete(user)}>
                      Delete
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

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
    </div>
  );
}
