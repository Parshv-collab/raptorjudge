import React, { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useAction, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { GlassCard } from "@/components/ui/GlassCard";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";

export default function AdminSettings() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const settings = useQuery(api.admin.getSettings, skip ? "skip" : {});
  const updateSettings = useMutation(api.admin.updateSettings);
  const reseed = useAction(api.seed.seed);

  // Lookups queries/mutations
  const professions = useQuery(api.admin.listLookups, skip ? "skip" : { type: "professions" });
  const createLookup = useMutation(api.admin.createLookup);
  const deactivateLookup = useMutation(api.admin.deactivateLookup);

  // Branding Fields
  const [siteName, setSiteName] = useState("RaptorJudge");
  const [siteTagline, setSiteTagline] = useState("Hackathon judging engineered for fairness");
  const [logoUrl, setLogoUrl] = useState("/logo.svg");
  const [footerCopyright, setFooterCopyright] = useState("© 2026 RaptorJudge");
  const [supportEmail, setSupportEmail] = useState("support@raptorjudge.local");

  // Platform Fields
  const [timezone, setTimezone] = useState("UTC");
  const [dateFormat, setDateFormat] = useState("locale");
  const [certBaseUrl, setCertBaseUrl] = useState("http://localhost:3000/verify");

  // Feature Flags
  const [maint, setMaint] = useState(false);
  const [regOpen, setRegOpen] = useState(true);
  const [mfaReq, setMfaReq] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(true);
  const [showScores, setShowScores] = useState(false);
  const [votingMode, setVotingMode] = useState("quadratic");

  // Lookup Modal State
  const [lookupModalOpen, setLookupModalOpen] = useState(false);
  const [lookupType, setLookupType] = useState("professions");
  const [lookupCode, setLookupCode] = useState("");
  const [lookupLabel, setLookupLabel] = useState("");

  // Danger Zone Confirmation
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings) {
      if (settings["site_name"]) setSiteName(settings["site_name"]);
      if (settings["site_tagline"]) setSiteTagline(settings["site_tagline"]);
      if (settings["logo_url"]) setLogoUrl(settings["logo_url"]);
      if (settings["footer_copyright"]) setFooterCopyright(settings["footer_copyright"]);
      if (settings["support_email"]) setSupportEmail(settings["support_email"]);

      if (settings["timezone"]) setTimezone(settings["timezone"]);
      if (settings["date_format"]) setDateFormat(settings["date_format"]);
      if (settings["cert_base_url"]) setCertBaseUrl(settings["cert_base_url"]);

      setMaint(settings["maintenance_mode"] === "true");
      setRegOpen(settings["registration_open"] !== "false");
      setMfaReq(settings["mfa_required"] === "true");
      setGalleryVisible(settings["gallery_visible_during_submission"] !== "false");
      setShowScores(settings["show_scores_during_judging"] === "true");
      if (settings["default_voting_mode"]) setVotingMode(settings["default_voting_mode"]);
    }
  }, [settings]);

  async function handleSaveSetting(key: string, value: string) {
    try {
      await updateSettings({ key, value });
      toast.success("Setting saved.");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    }
  }

  async function handleToggle(key: string, val: boolean, setter: (v: boolean) => void) {
    setter(val);
    await handleSaveSetting(key, String(val));
  }

  async function handleAddLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!lookupCode.trim() || !lookupLabel.trim()) return;
    try {
      await createLookup({ type: lookupType, code: lookupCode.trim(), label: lookupLabel.trim() });
      toast.success("Lookup entry added.");
      setLookupCode("");
      setLookupLabel("");
      setLookupModalOpen(false);
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    }
  }

  async function handleToggleLookupActive(type: string, id: string) {
    try {
      await deactivateLookup({ type, id });
      toast.success("Lookup status updated.");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    }
  }

  async function handleResetSeed() {
    if (resetConfirm !== "RESET") {
      toast.error('Type "RESET" to confirm.');
      return;
    }
    setBusy(true);
    try {
      await reseed({});
      toast.success("Seed data reset successfully!");
      setResetModalOpen(false);
      setResetConfirm("");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-8">
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (settings instanceof Error) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4">
        <GlassCard className="p-8 flex flex-col items-center text-center gap-4">
          <h2 className="text-xl font-bold text-[#1d1d1f]">Could not load settings</h2>
          <p className="text-xs text-[#6e6e73]">You may not have permission. Please sign in as an admin.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-8">
      <Link to="/admin">
        <span className="text-xs font-semibold text-[#ff0055] hover:underline">
          ← Back to Admin Dashboard
        </span>
      </Link>

      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
          System Controls
        </span>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
          Platform Settings
        </h1>
      </div>

      {/* 1. BRANDING */}
      <GlassCard className="p-6 flex flex-col gap-4">
        <h2 className="text-sm font-bold text-[#1d1d1f] uppercase tracking-wider text-[#ff0055]">
          1. Branding
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Site Name"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            onBlur={() => handleSaveSetting("site_name", siteName)}
          />
          <Input
            label="Site Tagline"
            value={siteTagline}
            onChange={(e) => setSiteTagline(e.target.value)}
            onBlur={() => handleSaveSetting("site_tagline", siteTagline)}
          />
          <Input
            label="Logo URL"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            onBlur={() => handleSaveSetting("logo_url", logoUrl)}
          />
          <Input
            label="Footer Copyright"
            value={footerCopyright}
            onChange={(e) => setFooterCopyright(e.target.value)}
            onBlur={() => handleSaveSetting("footer_copyright", footerCopyright)}
          />
          <Input
            label="Support Email"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            onBlur={() => handleSaveSetting("support_email", supportEmail)}
          />
        </div>
      </GlassCard>

      {/* 2. PLATFORM */}
      <GlassCard className="p-6 flex flex-col gap-4">
        <h2 className="text-sm font-bold text-[#1d1d1f] uppercase tracking-wider text-[#ff0055]">
          2. Platform Defaults
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Dropdown
            label="Default Timezone"
            options={[
              { value: "UTC", label: "UTC" },
              { value: "America/New_York", label: "Eastern (America/New_York)" },
              { value: "America/Los_Angeles", label: "Pacific (America/Los_Angeles)" },
              { value: "Europe/London", label: "London (Europe/London)" },
            ]}
            value={timezone}
            onChange={(v) => {
              setTimezone(v);
              handleSaveSetting("timezone", v);
            }}
          />
          <Dropdown
            label="Date Format"
            options={[
              { value: "locale", label: "Locale Default" },
              { value: "ISO", label: "ISO 8601 (YYYY-MM-DD)" },
            ]}
            value={dateFormat}
            onChange={(v) => {
              setDateFormat(v);
              handleSaveSetting("date_format", v);
            }}
          />
          <Input
            label="Certificate Verify Base URL"
            value={certBaseUrl}
            onChange={(e) => setCertBaseUrl(e.target.value)}
            onBlur={() => handleSaveSetting("cert_base_url", certBaseUrl)}
          />
        </div>
      </GlassCard>

      {/* 3. FEATURE FLAGS */}
      <GlassCard className="p-6 flex flex-col gap-4">
        <h2 className="text-sm font-bold text-[#1d1d1f] uppercase tracking-wider text-[#ff0055]">
          3. Feature Flags
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Checkbox
            label="Maintenance Mode (read-only for participants)"
            checked={maint}
            onChange={(e) => handleToggle("maintenance_mode", e.target.checked, setMaint)}
          />
          <Checkbox
            label="Allow Global Registrations"
            checked={regOpen}
            onChange={(e) => handleToggle("registration_open", e.target.checked, setRegOpen)}
          />
          <Checkbox
            label="Require 2FA / TOTP for Staff"
            checked={mfaReq}
            onChange={(e) => handleToggle("mfa_required", e.target.checked, setMfaReq)}
          />
          <Checkbox
            label="Gallery Visible During Submissions"
            checked={galleryVisible}
            onChange={(e) =>
              handleToggle("gallery_visible_during_submission", e.target.checked, setGalleryVisible)
            }
          />
          <Checkbox
            label="Show Scores During Judging Stage"
            checked={showScores}
            onChange={(e) =>
              handleToggle("show_scores_during_judging", e.target.checked, setShowScores)
            }
          />
          <Dropdown
            label="Default Voting Mode"
            options={[
              { value: "quadratic", label: "Quadratic Voting" },
              { value: "upvote", label: "Plain Upvote" },
            ]}
            value={votingMode}
            onChange={(v) => {
              setVotingMode(v);
              handleSaveSetting("default_voting_mode", v);
            }}
          />
        </div>
      </GlassCard>

      {/* 4. LOOKUP TABLES */}
      <GlassCard className="p-6 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-bold text-[#1d1d1f] uppercase tracking-wider text-[#ff0055]">
            4. Lookup Tables ({lookupType})
          </h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLookupModalOpen(true)}
          >
            + Add Entry
          </Button>
        </div>

        <div className="flex gap-2 mb-2">
          {["professions", "interests", "experience_levels", "education_levels"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setLookupType(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full capitalize transition-colors ${
                lookupType === t
                  ? "bg-[#ff0055] text-white"
                  : "bg-white/50 border border-white/80 text-[#6e6e73]"
              }`}
            >
              {t.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/10 font-bold uppercase text-[#6e6e73]">
                <th className="py-2 px-3">Code</th>
                <th className="py-2 px-3">Label</th>
                <th className="py-2 px-3">Active</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(professions || []).map((item: any) => (
                <tr key={item.id} className="border-b border-black/5 hover:bg-white/40">
                  <td className="py-2 px-3 font-mono">{item.code}</td>
                  <td className="py-2 px-3 font-bold">{item.label}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        item.active ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {item.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleLookupActive(lookupType, item.id)}
                    >
                      {item.active ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!professions || professions.length === 0) && (
            <p className="text-xs text-[#6e6e73] text-center py-4">No lookup entries found.</p>
          )}
        </div>
      </GlassCard>

      {/* 5. DANGER ZONE */}
      <GlassCard className="p-6 border-red-500/30 bg-red-500/5 flex flex-col gap-4">
        <h2 className="text-sm font-bold text-red-600 uppercase tracking-wider">
          5. Danger Zone
        </h2>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-xs font-bold text-[#1d1d1f]">Reset All Seed Fixtures</h3>
            <p className="text-xs text-[#6e6e73]">
              Reseed platform fixtures back to default Dogfood 2026 state.
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setResetModalOpen(true)}>
            Reset Seed Data
          </Button>
        </div>
      </GlassCard>

      {/* Add Lookup Modal */}
      <Modal
        isOpen={lookupModalOpen}
        onClose={() => setLookupModalOpen(false)}
        title={`Add Entry to ${lookupType}`}
      >
        <form onSubmit={handleAddLookup} className="flex flex-col gap-4 mt-2">
          <Input
            label="Entry Code *"
            required
            placeholder="e.g. dev"
            value={lookupCode}
            onChange={(e) => setLookupCode(e.target.value)}
          />
          <Input
            label="Display Label *"
            required
            placeholder="e.g. Software Developer"
            value={lookupLabel}
            onChange={(e) => setLookupLabel(e.target.value)}
          />
          <div className="flex justify-between items-center mt-2">
            <Button variant="ghost" size="md" onClick={() => setLookupModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit">
              Save Entry
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Seed Modal */}
      <Modal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title="Confirm Reset Seed Data"
        description='Type "RESET" to confirm resetting seed data.'
      >
        <div className="flex flex-col gap-4 mt-2">
          <Input
            placeholder="RESET"
            value={resetConfirm}
            onChange={(e) => setResetConfirm(e.target.value)}
          />
          <div className="flex justify-between items-center mt-2">
            <Button variant="ghost" size="md" onClick={() => setResetModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              isLoading={busy}
              disabled={resetConfirm !== "RESET"}
              onClick={handleResetSeed}
            >
              Confirm Reset
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
