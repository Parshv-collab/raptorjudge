import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { Modal } from "@/components/ui/Modal";
import { useAuthActions } from "@convex-dev/auth/react";
import { humanizeConvexError } from "@/lib/errors";

const PROFESSIONS = [
  { value: "developer", label: "Software Developer / Engineer" },
  { value: "designer", label: "UI/UX Designer" },
  { value: "student", label: "Student / Researcher" },
  { value: "product_manager", label: "Product Manager" },
  { value: "data_scientist", label: "Data Scientist / AI Engineer" },
  { value: "other", label: "Other" },
];

const INTERESTS = [
  { id: "ai", label: "AI & ML" },
  { id: "web3", label: "Web3 & Crypto" },
  { id: "mobile", label: "Mobile Apps" },
  { id: "cloud", label: "DevOps & Cloud" },
  { id: "game", label: "Game Dev" },
  { id: "hardware", label: "Hardware & IoT" },
  { id: "cybersecurity", label: "Cybersecurity" },
  { id: "design", label: "UX & Product Design" },
];

const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Beginner (0-1 years)" },
  { value: "intermediate", label: "Intermediate (2-4 years)" },
  { value: "advanced", label: "Advanced (5+ years)" },
];

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
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      toast.error("Invalid image type.");
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
      setAvatarUrl(storageId);
      await updateProfile({ avatarUrl: storageId });
      toast.success("Avatar updated!");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setUploading(false);
    }
  }
  const [profession, setProfession] = useState("developer");
  const [selectedInterests, setSelectedInterests] = useState<string[]>(["ai", "mobile"]);
  const [experience, setExperience] = useState("intermediate");
  const [busy, setBusy] = useState(false);

  // Delete Account Modal State (Issue 5)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  useEffect(() => {
    if (me) {
      setName(me.name || "");
      setBio(me.bio || "");
      setAvatarUrl(me.avatarUrl || "");
    }
  }, [me]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile({
        bio,
        avatarUrl,
      });
      toast.success("Profile updated successfully!");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText.trim() !== "DELETE") return;
    setBusy(true);
    try {
      await deleteAccount({});
      await signOut();
      toast.success("Your account has been scheduled for deletion.");
      window.location.href = "/";
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (me === undefined) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-8">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
          User Profile
        </span>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
          Profile Details
        </h1>
      </div>

      <GlassCard className="p-8">
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full Name" value={name} disabled />
            <Input label="Email Address" value={me?.email || ""} disabled />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#1d1d1f]">Avatar Image</label>
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full object-cover border border-white" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#ff0055]/10 text-[#ff0055] font-bold flex items-center justify-center">
                  {(name || "U").charAt(0)}
                </div>
              )}
              <label className="cursor-pointer px-3 py-1.5 text-xs font-semibold rounded-button bg-white/60 border border-white/80 hover:bg-white/90 transition-colors">
                {uploading ? "Uploading..." : "Upload Avatar"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#1d1d1f]">Bio</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell other hackathon participants about yourself..."
              className="w-full p-3 text-xs rounded-input text-[#1d1d1f] bg-white/50 border border-white/80 focus-ring-accent"
            />
          </div>

          <Dropdown
            label="Profession / Primary Role"
            options={PROFESSIONS}
            value={profession}
            onChange={(v) => setProfession(v)}
          />

          <ChipGroup
            label="Areas of Interest"
            options={INTERESTS}
            selectedIds={selectedInterests}
            onChange={(ids) => setSelectedInterests(ids)}
            maxSelectable={5}
          />

          <Dropdown
            label="Experience Level"
            options={EXPERIENCE_LEVELS}
            value={experience}
            onChange={(v) => setExperience(v)}
          />

          <div className="flex justify-end mt-2 pt-4 border-t border-black/5">
            <Button type="submit" variant="primary" size="md" isLoading={busy}>
              Save Profile Changes
            </Button>
          </div>
        </form>
      </GlassCard>

      {/* Danger Zone (Issue 5) */}
      <GlassCard className="p-8 border-red-200">
        <h3 className="text-sm font-bold text-[#e63946] mb-1">Danger Zone</h3>
        <p className="text-xs text-[#6e6e73] mb-4 leading-relaxed">
          Request account deletion and consent withdrawal under GDPR/DPDP guidelines.
        </p>

        <Button
          variant="danger"
          size="md"
          onClick={() => {
            setDeleteConfirmText("");
            setDeleteModalOpen(true);
          }}
        >
          Delete Account
        </Button>
      </GlassCard>

      {/* Delete Account Modal (Issue 5 & 6) */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Account Deletion"
        description="This will disable your account and sign you out. Your data will be permanently deleted after 30 days."
      >
        <div className="flex flex-col gap-4 mt-2">
          <Input
            label="To confirm, type DELETE below"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
          />

          <div className="flex justify-between items-center mt-2">
            <Button variant="ghost" size="md" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              isLoading={busy}
              disabled={deleteConfirmText.trim() !== "DELETE"}
              onClick={handleDeleteAccount}
            >
              Permanently Delete Account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
