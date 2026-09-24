import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";

export default function AdminSettings() {
  const settings = useQuery(api.admin.getSettings, {});
  const updateSettings = useMutation(api.admin.updateSettings);

  const [maint, setMaint] = useState(false);
  const [regOpen, setRegOpen] = useState(true);
  const [mfaReq, setMfaReq] = useState(false);

  useEffect(() => {
    if (settings) {
      setMaint(settings["maintenance_mode"] === "true");
      setRegOpen(settings["registration_open"] !== "false");
      setMfaReq(settings["mfa_required"] === "true");
    }
  }, [settings]);

  async function handleToggle(key: string, val: boolean, setter: (v: boolean) => void) {
    setter(val);
    try {
      await updateSettings({ key, value: String(val) });
      toast.success("Platform settings updated.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update setting");
    }
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
          System Controls
        </span>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
          Platform Settings
        </h1>
      </div>

      <GlassCard className="p-6 flex flex-col gap-6">
        <h2 className="text-sm font-bold text-[#1d1d1f]">Global System Toggles</h2>

        <div className="flex flex-col gap-4">
          <Checkbox
            label="Maintenance Mode (read-only mode for participants)"
            checked={maint}
            onChange={(e) => handleToggle("maintenance_mode", e.target.checked, setMaint)}
          />

          <Checkbox
            label="Allow Global Registrations"
            checked={regOpen}
            onChange={(e) => handleToggle("registration_open", e.target.checked, setRegOpen)}
          />

          <Checkbox
            label="Require 2FA / TOTP for Organizer & Admin roles"
            checked={mfaReq}
            onChange={(e) => handleToggle("mfa_required", e.target.checked, setMfaReq)}
          />
        </div>
      </GlassCard>
    </div>
  );
}
