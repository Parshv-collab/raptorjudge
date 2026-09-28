import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { useAuthActions } from "@convex-dev/auth/react";
import { humanizeConvexError } from "@/lib/errors";
import { clearConvexAuthSessionKeys } from "@/lib/sessionCleanup";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Avatar } from "@/components/ui/Avatar";
import { Markdown } from "@/components/ui/Markdown";
import { ConfirmDialog } from "@/components/ui/Modal";

export default function Profile() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const me = useQuery(api.users.me, skip ? "skip" : {});
  const updateProfile = useMutation(api.users.updateProfile);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const generateUploadUrl = useMutation(api.events.generateUploadUrl);
  const { signOut } = useAuthActions();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarStorageId, setAvatarStorageId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Issue 38: resolve the stored avatar (a Convex storage id, or a legacy http
  // URL) to a displayable URL server-side. Rendering the raw storage id in an
  // <img> was what produced the broken picture.
  const myAvatar = useQuery(api.users.myAvatarUrl, skip ? "skip" : {});
  const displayAvatarUrl = myAvatar || "";

  useEffect(() => {
    if (me) {
      setName(me.name || "");
      setBio(me.bio || "");
      setAvatarStorageId(me.avatarUrl || "");
    }
  }, [me]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      toast.error("Invalid image type. Supported: JPG, PNG, WEBP, GIF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large (max 5MB).");
      return;
    }
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      setAvatarStorageId(storageId);
      await updateProfile({ avatarUrl: storageId });
      toast.success("Profile picture updated.");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile({ name, bio, avatarUrl: avatarStorageId });
      toast.success("Profile updated.");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAccount() {
    setBusy(true);
    try {
      await deleteAccount({});
      clearConvexAuthSessionKeys();
      await signOut();
      toast.success("Your account has been scheduled for deletion.");
      window.location.href = "/";
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
      setBusy(false);
    }
  }
  if (authLoading || me === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <PageHeader
        title="Profile"
        description="How you appear across events, teams and galleries."
      />

      <form onSubmit={handleSaveProfile} className="flex flex-col gap-6">
        <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-6">
          {/* Identity + avatar */}
          <div className="flex items-center gap-5">
            {displayAvatarUrl ? (
              <img
                src={displayAvatarUrl}
                alt="Current avatar"
                className="w-14 h-14 rounded-full object-cover border border-line shrink-0"
              />
            ) : (
              <Avatar name={name || me?.email || "User"} size="lg" />
            )}
            <div className="flex flex-col gap-1.5">
              <label
                className={`cursor-pointer px-4 h-10 inline-flex items-center rounded-btn border border-line bg-surface-2 text-sm font-medium text-primary hover:border-line-strong transition-colors duration-fast w-max ${
                  uploading ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                {uploading ? "Uploading…" : "Upload picture"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                />
              </label>
              <span className="text-[13px] text-muted">JPG, PNG, WEBP or GIF up to 5MB.</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              helperText="Shown on your profile, in team chat and on certificates you receive."
            />
            <Input label="Email address" value={me?.email || ""} disabled />
          </div>

          <Textarea
            label="Bio (Markdown supported)"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell other participants what you build…"
            maxLength={500}
          />

          {bio.trim() && (
            <div className="bg-surface-2 border border-line rounded-card p-4">
              <p className="text-[11px] uppercase tracking-[0.05em] text-muted mb-2">
                Bio preview
              </p>
              <Markdown content={bio} className="text-[13px]" />
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" isLoading={busy}>
            Save profile
          </Button>
        </div>
      </form>

      {/* Danger zone */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-danger">Danger zone</h2>
        <div className="bg-danger/5 border border-danger/40 rounded-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-[15px] font-medium text-primary">Delete account</h3>
            <p className="text-[13px] text-secondary mt-0.5">
              Requests deletion and consent withdrawal under GDPR/DPDP. The account is disabled and
              signed out; data is permanently removed after 30 days.
            </p>
          </div>
          <Button variant="danger" onClick={() => setDeleteModalOpen(true)} className="shrink-0">
            Delete account
          </Button>
        </div>
      </section>

      <ConfirmDialog
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteAccount}
        title="Delete account"
        description="This disables your account and signs you out everywhere. Your data is permanently deleted after 30 days."
        confirmLabel="Permanently delete"
        destructive
        requireTyping="DELETE"
        isLoading={busy}
      />
    </div>
  );
}
