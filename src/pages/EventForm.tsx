import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { GlassCard } from "@/components/ui/GlassCard";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const toTs = (s: string, fallback = Date.now()) => (s ? new Date(s).getTime() : fallback);
const fromTs = (n?: number) => (n ? new Date(n).toISOString().slice(0, 16) : "");

type FormState = {
  title: string;
  slug: string;
  hostName: string;
  bannerUrl: string;
  shortDescription: string;
  fullDescription: string;
  rules: string;
  registrationOpens: string;
  registrationCloses: string;
  submissionOpens: string;
  submissionDeadline: string;
  judgingStarts: string;
  judgingEnds: string;
  resultsAnnounced: string;
  minTeamSize: number;
  maxTeamSize: number;
  soloAllowed: boolean;
  coverImageRequired: boolean;
};

const blankForm: FormState = {
  title: "",
  slug: "",
  hostName: "",
  bannerUrl: "",
  shortDescription: "",
  fullDescription: "",
  rules: "",
  registrationOpens: "",
  registrationCloses: "",
  submissionOpens: "",
  submissionDeadline: "",
  judgingStarts: "",
  judgingEnds: "",
  resultsAnnounced: "",
  minTeamSize: 1,
  maxTeamSize: 4,
  soloAllowed: true,
  coverImageRequired: false,
};

export default function EventForm({ edit = false }: { edit?: boolean }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const event = useQuery(api.events.getBySlug, skip || !edit || !slug ? "skip" : { slug });
  const create = useMutation(api.events.create);
  const update = useMutation(api.events.update);
  const generateUploadUrl = useMutation(api.events.generateUploadUrl);

  const [form, setForm] = useState<FormState>(blankForm);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      toast.error("Invalid image type. Supported: JPG, PNG, WEBP, GIF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image file too large. Max size is 5MB.");
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
      setField("bannerUrl", storageId);
      toast.success("Banner image uploaded successfully!");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (event) {
      setForm({
        title: event.title,
        slug: event.slug,
        hostName: event.hostName ?? "",
        bannerUrl: event.bannerUrl ?? "",
        shortDescription: event.shortDescription ?? event.tagline,
        fullDescription: event.fullDescription ?? event.description,
        rules: event.rules ?? "",
        registrationOpens: fromTs(event.registrationOpens ?? event.registrationStart),
        registrationCloses: fromTs(event.registrationCloses ?? event.registrationEnd),
        submissionOpens: fromTs(event.submissionOpens),
        submissionDeadline: fromTs(event.submissionDeadline),
        judgingStarts: fromTs(event.judgingStarts ?? event.judgingStart),
        judgingEnds: fromTs(event.judgingEnds ?? event.judgingEnd),
        resultsAnnounced: fromTs(event.resultsAnnounced ?? event.votingEnd),
        minTeamSize: event.minTeamSize ?? 1,
        maxTeamSize: event.maxTeamSize ?? 4,
        soloAllowed: event.soloAllowed ?? true,
        coverImageRequired: event.coverImageRequired ?? false,
      });
    }
  }, [event]);

  const setField = (key: keyof FormState, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = useMemo(() => {
    const regStart = toTs(form.registrationOpens);
    const regEnd = toTs(form.registrationCloses);
    const subOpens = toTs(form.submissionOpens, regStart);
    const subDeadline = toTs(form.submissionDeadline, regEnd);
    const judgeStart = toTs(form.judgingStarts, subDeadline);
    const judgeEnd = toTs(form.judgingEnds, judgeStart);
    const resAnnounced = toTs(form.resultsAnnounced, judgeEnd);

    return {
      slug: form.slug,
      title: form.title,
      tagline: form.shortDescription,
      description: form.fullDescription,
      registrationStart: regStart,
      registrationEnd: regEnd,
      submissionDeadline: subDeadline,
      judgingStart: judgeStart,
      judgingEnd: judgeEnd,
      votingStart: resAnnounced,
      votingEnd: resAnnounced,
      registrationOpens: regStart,
      registrationCloses: regEnd,
      submissionOpens: subOpens,
      judgingStarts: judgeStart,
      judgingEnds: judgeEnd,
      resultsAnnounced: resAnnounced,
      hostName: form.hostName,
      bannerUrl: form.bannerUrl,
      shortDescription: form.shortDescription,
      fullDescription: form.fullDescription,
      rules: form.rules,
      minTeamSize: form.minTeamSize,
      maxTeamSize: form.maxTeamSize,
      soloAllowed: form.soloAllowed,
      coverImageRequired: form.coverImageRequired,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      settings: `max_team_size=${Number(form.maxTeamSize)},voting_type=quadratic`,
    };
  }, [form]);

  async function handleSaveDraft() {
    if (!form.title.trim() || !form.slug.trim()) {
      toast.error("Please fill in event title and slug.");
      return;
    }
    setBusy(true);
    try {
      if (edit && event) {
        await update({
          eventId: event._id,
          ...buildPayload,
        });
        toast.success("Event updated successfully!");
      } else {
        await create(buildPayload);
        toast.success("Event draft saved!");
      }
      navigate(`/organizer/events/${form.slug}`);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-8">
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-8">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
          Organizer Form
        </span>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
          {edit ? "Edit Event" : "Create New Event"}
        </h1>
      </div>

      <GlassCard className="p-8 flex flex-col gap-6">
        <h2 className="text-sm font-bold text-[#1d1d1f]">Identity & Overview</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Event Title *"
            required
            value={form.title}
            onChange={(e) => {
              setField("title", e.target.value);
              if (!edit) setField("slug", slugify(e.target.value));
            }}
            placeholder="Hackathon 2026"
          />

          <Input
            label="URL Slug *"
            required
            value={form.slug}
            onChange={(e) => setField("slug", slugify(e.target.value))}
            placeholder="hackathon-2026"
          />

          <Input
            label="Host Name"
            value={form.hostName}
            onChange={(e) => setField("hostName", e.target.value)}
            placeholder="RaptorJudge Community"
          />

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-[#1d1d1f]">Banner Image</label>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <Input
                placeholder="https://... or upload file"
                value={form.bannerUrl}
                onChange={(e) => setField("bannerUrl", e.target.value)}
                className="flex-1"
              />
              <label className="cursor-pointer px-4 py-2 text-xs font-semibold rounded-button bg-white/60 border border-white/80 hover:bg-white/90 transition-colors shrink-0">
                {uploading ? "Uploading..." : "Upload File"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
              {form.bannerUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setField("bannerUrl", "")}
                >
                  Remove
                </Button>
              )}
            </div>
            {form.bannerUrl && (
              <div className="mt-2 relative w-full h-32 rounded-card overflow-hidden border border-white/80">
                <img src={form.bannerUrl} alt="Banner Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        </div>

        <Input
          label="Short Tagline / Description"
          value={form.shortDescription}
          onChange={(e) => setField("shortDescription", e.target.value)}
          placeholder="Brief one-line summary"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#1d1d1f]">
            Full Description (Markdown)
          </label>
          <textarea
            rows={5}
            value={form.fullDescription}
            onChange={(e) => setField("fullDescription", e.target.value)}
            className="w-full p-3 text-xs rounded-input bg-white/50 border border-white/80 focus-ring-accent"
            placeholder="Detailed description of the hackathon..."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#1d1d1f]">
            Rules & Guidelines (Markdown)
          </label>
          <textarea
            rows={4}
            value={form.rules}
            onChange={(e) => setField("rules", e.target.value)}
            className="w-full p-3 text-xs rounded-input bg-white/50 border border-white/80 focus-ring-accent"
            placeholder="Rules, code of conduct, submission eligibility..."
          />
        </div>

        <h2 className="text-sm font-bold text-[#1d1d1f] pt-4 border-t border-black/5">
          Event Schedule (7 Phase Dates)
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Input
            label="Registration Opens"
            type="datetime-local"
            value={form.registrationOpens}
            onChange={(e) => setField("registrationOpens", e.target.value)}
          />
          <Input
            label="Registration Closes *"
            type="datetime-local"
            required
            value={form.registrationCloses}
            onChange={(e) => setField("registrationCloses", e.target.value)}
          />
          <Input
            label="Submission Opens"
            type="datetime-local"
            value={form.submissionOpens}
            onChange={(e) => setField("submissionOpens", e.target.value)}
          />
          <Input
            label="Submission Deadline *"
            type="datetime-local"
            required
            value={form.submissionDeadline}
            onChange={(e) => setField("submissionDeadline", e.target.value)}
          />
          <Input
            label="Judging Starts"
            type="datetime-local"
            value={form.judgingStarts}
            onChange={(e) => setField("judgingStarts", e.target.value)}
          />
          <Input
            label="Judging Ends"
            type="datetime-local"
            value={form.judgingEnds}
            onChange={(e) => setField("judgingEnds", e.target.value)}
          />
          <Input
            label="Results Announced *"
            type="datetime-local"
            required
            value={form.resultsAnnounced}
            onChange={(e) => setField("resultsAnnounced", e.target.value)}
          />
        </div>

        <h2 className="text-sm font-bold text-[#1d1d1f] pt-4 border-t border-black/5">
          Participation & Team Settings
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Min Team Size"
            type="number"
            value={form.minTeamSize}
            onChange={(e) => setField("minTeamSize", Number(e.target.value))}
          />
          <Input
            label="Max Team Size"
            type="number"
            value={form.maxTeamSize}
            onChange={(e) => setField("maxTeamSize", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-6 mt-2">
          <Checkbox
            label="Solo Participation Allowed"
            checked={form.soloAllowed}
            onChange={(e) => setField("soloAllowed", e.target.checked)}
          />
          <Checkbox
            label="Cover Image Required for Submissions"
            checked={form.coverImageRequired}
            onChange={(e) => setField("coverImageRequired", e.target.checked)}
          />
        </div>

        {/* Buttons */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-black/5">
          <Button variant="ghost" size="md" onClick={() => navigate(-1)}>
            Cancel
          </Button>

          <Button
            variant="primary"
            size="md"
            isLoading={busy}
            onClick={handleSaveDraft}
          >
            {edit ? "Update Event" : "Save Event Draft"}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
