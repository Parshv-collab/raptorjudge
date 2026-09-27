import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

export default function Settings() {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [submissionAlerts, setSubmissionAlerts] = useState(true);
  const [language, setLanguage] = useState("en");

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <PageHeader
        title="Account settings"
        description="Interface language and notification preferences."
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary">Interface</h2>
        <div className="bg-surface-1 border border-line rounded-card p-6">
          <Dropdown
            label="Display language"
            options={[
              { value: "en", label: "English (US)" },
              { value: "es", label: "Español" },
              { value: "fr", label: "Français" },
            ]}
            value={language}
            onChange={setLanguage}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary">Notifications</h2>
        <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-4">
          <Checkbox
            label="Email me when a submission stage changes"
            checked={emailNotifications}
            onChange={(e) => setEmailNotifications(e.target.checked)}
          />
          <Checkbox
            label="Email me when my judging queue is updated"
            checked={submissionAlerts}
            onChange={(e) => setSubmissionAlerts(e.target.checked)}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => toast.success("Settings saved.")}
        >
          Save settings
        </Button>
      </div>
    </div>
  );
}
