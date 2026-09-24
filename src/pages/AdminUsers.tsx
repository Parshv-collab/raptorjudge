import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";

const ROLE_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "admin", label: "Admin" },
  { value: "organizer", label: "Organizer" },
  { value: "judge", label: "Judge" },
  { value: "participant", label: "Participant" },
];

export default function AdminUsers() {
  const users = useQuery(api.users.list, {});
  const setRole = useMutation(api.users.setRole);
  const disableUser = useMutation(api.users.adminDisable);
  const forceLogout = useMutation(api.users.adminForceLogout);
  const deleteUser = useMutation(api.users.adminDelete);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [targetRole, setTargetRole] = useState("participant");
  const [busy, setBusy] = useState(false);

  async function handleDisable(u: any) {
    try {
      await disableUser({ userId: u._id });
      toast.success(`User ${u.email} disabled.`);
    } catch (e: any) {
      toast.error(e.message || "Failed to disable user");
    }
  }

  async function handleForceLogout(u: any) {
    try {
      await forceLogout({ userId: u._id });
      toast.success(`Force logout executed for ${u.email}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to force logout");
    }
  }

  async function handleDelete(u: any) {
    if (!confirm(`Are you sure you want to permanently delete user ${u.email}?`)) return;
    try {
      await deleteUser({ userId: u._id });
      toast.success(`User ${u.email} deleted.`);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete user");
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
      toast.error(e.message || "Failed to update role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-6">
      <Link to="/admin">
        <span className="text-xs font-semibold text-[#ff0055] hover:underline">
          ← Back to Admin Dashboard
        </span>
      </Link>

      <div className="flex justify-between items-center">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            User Management
          </span>
          <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
            Platform Users
          </h1>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <GlassCard className="p-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="w-full sm:flex-1">
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Dropdown
            options={ROLE_OPTIONS}
            value={roleFilter}
            onChange={(v) => setRoleFilter(v)}
          />
        </div>
      </GlassCard>

      {/* Users Table */}
      <GlassCard className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/10 font-bold uppercase tracking-wider text-[#6e6e73]">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user: any) => (
                <tr key={user._id} className="border-b border-black/5 hover:bg-white/40 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-[#1d1d1f]">{user.name || "—"}</td>
                  <td className="py-3.5 px-4 font-mono text-[#6e6e73]">{user.email}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
                      {user.role || "disabled"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right flex gap-1 justify-end">
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
                    <Button variant="ghost" size="sm" onClick={() => handleDisable(user)}>
                      Disable
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleForceLogout(user)}>
                      Logout
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(user)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <p className="text-xs text-[#6e6e73] text-center py-8">
              No users found matching current filter or query.
            </p>
          )}
        </div>
      </GlassCard>

      {/* Role Change Modal */}
      <Modal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="Change User Role"
        description={`Modify access role for ${selectedUser?.name || selectedUser?.email}`}
      >
        <div className="flex flex-col gap-4 mt-2">
          <Dropdown
            label="Select New Role"
            options={ROLE_OPTIONS.filter((r) => r.value !== "all")}
            value={targetRole}
            onChange={(v) => setTargetRole(v)}
          />

          <div className="flex justify-between items-center mt-4">
            <Button variant="ghost" size="md" onClick={() => setSelectedUser(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              isLoading={busy}
              onClick={handleConfirmRoleChange}
            >
              Confirm Role Change
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
