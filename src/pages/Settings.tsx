import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

export default function Settings() {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [submissionAlerts, setSubmissionAlerts] = useState(true);
  const [language, setLanguage] = useState("en");

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-8">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
          Preferences
        </span>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
          Account Settings
        </h1>
      </div>

      <GlassCard className="p-8 flex flex-col gap-6">
        <h2 className="text-sm font-bold text-[#1d1d1f]">Interface & Language</h2>

        <Dropdown
          label="Display Language"
          options={[
            { value: "en", label: "English (US)" },
            { value: "es", label: "Spanish" },
            { value: "fr", label: "French" },
          ]}
          value={language}
          onChange={(v) => setLanguage(v)}
        />

        <h2 className="text-sm font-bold text-[#1d1d1f] pt-4 border-t border-black/5">
          Notification Preferences
        </h2>

        <div className="flex flex-col gap-3">
          <Checkbox
            label="Email updates when submission stage changes"
            checked={emailNotifications}
            onChange={(e) => setEmailNotifications(e.target.checked)}
          />
          <Checkbox
            label="Judges scoring completion notifications"
            checked={submissionAlerts}
            onChange={(e) => setSubmissionAlerts(e.target.checked)}
          />
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t border-black/5">
          <Button
            variant="primary"
            size="md"
            onClick={() => toast.success("Settings saved successfully!")}
          >
            Save Settings
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
