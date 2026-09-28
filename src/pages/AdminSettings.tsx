import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useAction, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";

const LOOKUP_TYPES = ["professions", "interests", "experience_levels", "education_levels"];

export default function AdminSettings() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const settings = useQuery(api.admin.getSettings, skip ? "skip" : {});
  const updateSettings = useMutation(api.admin.updateSettings);
  const reseed = useAction(api.seed.seed);

  const professions = useQuery(api.admin.listLookups, skip ? "skip" : { type: "professions" });
  const createLookup = useMutation(api.admin.createLookup);
  const deactivateLookup = useMutation(api.admin.deactivateLookup);
  // `updateLookup` is the only way to fix a label typo — activation alone is
  // covered by `deactivateLookup`.
  const updateLookup = useMutation(api.admin.updateLookup);

  // Branding
  const [siteName, setSiteName] = useState("RaptorJudge");
  const [siteTagline, setSiteTagline] = useState("Hackathon judging engineered for fairness");
  const [logoUrl, setLogoUrl] = useState("/logo.svg");
  const [footerCopyright, setFooterCopyright] = useState("© 2026 RaptorJudge");
  const [supportEmail, setSupportEmail] = useState("support@raptorjudge.local");

  // Platform
  const [timezone, setTimezone] = useState("UTC");
  const [dateFormat, setDateFormat] = useState("locale");
  const [certBaseUrl, setCertBaseUrl] = useState("http://localhost:3000/verify");

  // Feature flags
  const [maint, setMaint] = useState(false);
  const [regOpen, setRegOpen] = useState(true);
  const [mfaReq, setMfaReq] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(true);
  const [showScores, setShowScores] = useState(false);
  const [votingMode, setVotingMode] = useState("quadratic");

  // Lookup table state
  const [lookupModalOpen, setLookupModalOpen] = useState(false);
  const [lookupEditTarget, setLookupEditTarget] = useState<any>(null);
  const [lookupEditLabel, setLookupEditLabel] = useState("");
  const [lookupEditBusy, setLookupEditBusy] = useState(false);
  const [lookupType, setLookupType] = useState("professions");
  const [lookupCode, setLookupCode] = useState("");
  const [lookupLabel, setLookupLabel] = useState("");

  // Danger zone
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings && !(settings instanceof Error)) {
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

  async function handleRenameLookup() {
    if (!lookupEditTarget || !lookupEditLabel.trim()) return;
    setLookupEditBusy(true);
    try {
      await updateLookup({
        type: lookupType,
        id: lookupEditTarget.id,
        label: lookupEditLabel.trim(),
        active: Boolean(lookupEditTarget.active),
        sortOrder: lookupEditTarget.sortOrder ?? 0,
      });
      toast.success("Lookup label updated.");
      setLookupEditTarget(null);
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setLookupEditBusy(false);
    }
  }

  async function handleResetSeed() {
    setBusy(true);
    try {
      await reseed({});
      toast.success("Seed data reset successfully.");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (settings instanceof Error) {
    return (
      <EmptyState
        title="Could not load settings"
        description="You may not have permission to view platform settings. Sign in as an admin and try again."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform settings"
        description="Branding, defaults, feature flags and the seed reset — saved per-field on change."
      />

      {/*
        Honesty banner. Every value on this page is written to the `platform`
        table and audit-logged, and the lookup-table CRUD further down is fully
        wired — but a sweep of the codebase found that **no** of these keys is
        read by any query, mutation or component. Turning on "Maintenance mode"
        does not take the site down, and requiring 2FA does not require it.
        Promising enforcement that does not exist is the same defect as a fake
        control, so the page now says so plainly instead of implying otherwise.
      */}
      <Alert variant="warning" title="These preferences are stored, not enforced">
        Every value below is saved and audit-logged, but this build does not yet read any of them at
        runtime — branding, timezone, date format, certificate URL and the feature flags all persist
        and are ignored until the corresponding code path consumes them. The lookup tables further
        down this page are fully wired and do take effect. The seed reset at the bottom is real.
      </Alert>

      {/* Branding */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary">Branding</h2>
        <div className="bg-surface-1 border border-line rounded-card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Site name"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            onBlur={() => handleSaveSetting("site_name", siteName)}
          />
          <Input
            label="Site tagline"
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
            label="Footer copyright"
            value={footerCopyright}
            onChange={(e) => setFooterCopyright(e.target.value)}
            onBlur={() => handleSaveSetting("footer_copyright", footerCopyright)}
          />
          <Input
            label="Support email"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            onBlur={() => handleSaveSetting("support_email", supportEmail)}
          />
        </div>
      </section>

      {/* Platform defaults */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary">Platform defaults</h2>
        <div className="bg-surface-1 border border-line rounded-card p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Dropdown
            label="Default timezone"
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
            label="Date format"
            options={[
              { value: "locale", label: "Locale default" },
              { value: "ISO", label: "ISO 8601 (YYYY-MM-DD)" },
            ]}
            value={dateFormat}
            onChange={(v) => {
              setDateFormat(v);
              handleSaveSetting("date_format", v);
            }}
          />
          <Input
            label="Certificate verify base URL"
            value={certBaseUrl}
            onChange={(e) => setCertBaseUrl(e.target.value)}
            onBlur={() => handleSaveSetting("cert_base_url", certBaseUrl)}
          />
        </div>
      </section>

      {/* Feature flags */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary flex items-center gap-2.5">
          Feature flags
          <Badge variant="warning">Not enforced yet</Badge>
        </h2>
        <div className="bg-surface-1 border border-line rounded-card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Checkbox
            label="Maintenance mode (read-only for participants)"
            checked={maint}
            onChange={(e) => handleToggle("maintenance_mode", e.target.checked, setMaint)}
          />
          <Checkbox
            label="Allow global registrations"
            checked={regOpen}
            onChange={(e) => handleToggle("registration_open", e.target.checked, setRegOpen)}
          />
          <Checkbox
            label="Require 2FA / TOTP for staff"
            checked={mfaReq}
            onChange={(e) => handleToggle("mfa_required", e.target.checked, setMfaReq)}
          />
          <Checkbox
            label="Gallery visible during submissions"
            checked={galleryVisible}
            onChange={(e) =>
              handleToggle("gallery_visible_during_submission", e.target.checked, setGalleryVisible)
            }
          />
          <Checkbox
            label="Show scores during judging stage"
            checked={showScores}
            onChange={(e) =>
              handleToggle("show_scores_during_judging", e.target.checked, setShowScores)
            }
          />
          <Dropdown
            label="Default voting mode"
            options={[
              { value: "quadratic", label: "Quadratic voting" },
              { value: "upvote", label: "Plain upvote" },
            ]}
            value={votingMode}
            onChange={(v) => {
              setVotingMode(v);
              handleSaveSetting("default_voting_mode", v);
            }}
          />
        </div>
      </section>

      {/* Lookup tables */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-h3 text-primary">Lookup tables</h2>
          <Button variant="secondary" size="sm" onClick={() => setLookupModalOpen(true)}>
            Add entry
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {LOOKUP_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setLookupType(t)}
              className={`h-8 px-3.5 rounded-pill text-[13px] font-medium border transition-colors duration-fast ${
                lookupType === t
                  ? "bg-accent/10 text-accent border-accent/40"
                  : "bg-surface-1 text-secondary border-line hover:text-primary hover:border-line-strong"
              }`}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {professions === undefined ? (
          <SkeletonCard lines={3} />
        ) : (professions as any[]).length === 0 ? (
          <EmptyState
            title="No lookup entries"
            description={`No entries exist for ${lookupType.replace(/_/g, " ")} yet. Add one to make it selectable during registration.`}
          />
        ) : (
          <Table caption={`${lookupType} lookup table`}>
            <THead>
              <tr>
                <TH>Code</TH>
                <TH>Label</TH>
                <TH>Status</TH>
                <TH numeric>Actions</TH>
              </tr>
            </THead>
            <tbody>
              {(professions as any[]).map((item: any) => (
                <TR key={item.id}>
                  <TD mono>{item.code}</TD>
                  <TD>{item.label}</TD>
                  <TD>
                    <Badge variant={item.active ? "success" : "default"}>
                      {item.active ? "Active" : "Inactive"}
                    </Badge>
                  </TD>
                  <TD numeric>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setLookupEditTarget(item);
                          setLookupEditLabel(item.label);
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleLookupActive(lookupType, item.id)}
                      >
                        {item.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {/* Rename a lookup label (fixing a typo without deleting the entry) */}
      <Modal
        isOpen={!!lookupEditTarget}
        onClose={() => setLookupEditTarget(null)}
        title="Rename lookup entry"
        description={`Edit the label shown for ${lookupEditTarget?.code ?? ""} in the ${lookupType.replace(/_/g, " ")} list.`}
      >
        <div className="flex flex-col gap-4 mt-2">
          <Input
            label="Label"
            value={lookupEditLabel}
            onChange={(e) => setLookupEditLabel(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setLookupEditTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={lookupEditBusy}
              disabled={!lookupEditLabel.trim()}
              onClick={handleRenameLookup}
            >
              Save label
            </Button>
          </div>
        </div>
      </Modal>

      {/* Danger zone */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-danger">Danger zone</h2>
        <div className="bg-danger/5 border border-danger/40 rounded-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-[15px] font-medium text-primary">Reset all seed fixtures</h3>
            <p className="text-[13px] text-secondary mt-0.5">
              Wipes and rebuilds the Dogfood 2026 fixture population from the seed script.
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setResetModalOpen(true)} className="shrink-0">
            Reset seed data
          </Button>
        </div>
      </section>

      {/* Add lookup modal */}
      <Modal
        isOpen={lookupModalOpen}
        onClose={() => setLookupModalOpen(false)}
        title={`Add entry to ${lookupType.replace(/_/g, " ")}`}
      >
        <form onSubmit={handleAddLookup} className="flex flex-col gap-4 mt-2">
          <Input
            label="Entry code"
            required
            placeholder="e.g. dev"
            value={lookupCode}
            onChange={(e) => setLookupCode(e.target.value)}
          />
          <Input
            label="Display label"
            required
            placeholder="e.g. Software Developer"
            value={lookupLabel}
            onChange={(e) => setLookupLabel(e.target.value)}
          />
          <div className="flex justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => setLookupModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Save entry
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset confirm */}
      <ConfirmDialog
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={handleResetSeed}
        title="Reset seed data"
        description="This wipes all fixture data and rebuilds it from the seed script. Events and accounts created outside the seed will be removed."
        confirmLabel="Reset seed"
        destructive
        requireTyping="RESET"
        isLoading={busy}
      />
    </div>
  );
}
