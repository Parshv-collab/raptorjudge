import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { PageHeader } from "@/components/ui/PageHeader";

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
      toast.success("Banner image uploaded");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?._id]);

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
        toast.success("Event updated");
      } else {
        await create(buildPayload);
        toast.success("Event draft saved");
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
      <div className="flex flex-col gap-8">
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
      <PageHeader
        title={edit ? "Edit event" : "Create new event"}
        description="Basics, schedule and participation settings."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSaveDraft();
        }}
        className="flex flex-col gap-10"
      >
        {/* Identity */}
        <section className="flex flex-col gap-5">
          <h2 className="text-h3 text-primary">Identity & overview</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Event title"
              required
              value={form.title}
              onChange={(e) => {
                setField("title", e.target.value);
                if (!edit) setField("slug", slugify(e.target.value));
              }}
              placeholder="Hackathon 2026"
            />
            <Input
              label="URL slug"
              required
              value={form.slug}
              onChange={(e) => setField("slug", slugify(e.target.value))}
              placeholder="hackathon-2026"
            />
            <Input
              label="Host name"
              value={form.hostName}
              onChange={(e) => setField("hostName", e.target.value)}
              placeholder="RaptorJudge Community"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-secondary">Banner image</label>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <Input
                aria-label="Banner URL"
                placeholder="https://... or upload file"
                value={form.bannerUrl}
                onChange={(e) => setField("bannerUrl", e.target.value)}
                className="flex-1"
              />
              <label className="cursor-pointer h-10 px-4 text-[13px] font-medium rounded-btn bg-surface-2 border border-line hover:border-line-strong text-secondary hover:text-primary transition-colors duration-fast inline-flex items-center justify-center shrink-0">
                {uploading ? "Uploading…" : "Upload file"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
              {form.bannerUrl && (
                <Button variant="ghost" size="sm" onClick={() => setField("bannerUrl", "")}>
                  Remove
                </Button>
              )}
            </div>
            {form.bannerUrl && (
              <div className="mt-2 relative w-full h-32 rounded-card overflow-hidden border border-line">
                <img src={form.bannerUrl} alt="Banner preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          <Input
            label="Short tagline"
            value={form.shortDescription}
            onChange={(e) => setField("shortDescription", e.target.value)}
            placeholder="Brief one-line summary"
          />

          <Textarea
            label="Full description (Markdown)"
            rows={5}
            value={form.fullDescription}
            onChange={(e) => setField("fullDescription", e.target.value)}
            placeholder="Detailed description of the hackathon..."
          />

          <Textarea
            label="Rules & guidelines (Markdown)"
            rows={4}
            value={form.rules}
            onChange={(e) => setField("rules", e.target.value)}
            placeholder="Rules, code of conduct, submission eligibility..."
          />
        </section>

        {/* Schedule */}
        <section className="flex flex-col gap-5 border-t border-line pt-8">
          <h2 className="text-h3 text-primary">Event schedule</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input
              label="Registration opens"
              type="datetime-local"
              value={form.registrationOpens}
              onChange={(e) => setField("registrationOpens", e.target.value)}
            />
            <Input
              label="Registration closes"
              type="datetime-local"
              required
              value={form.registrationCloses}
              onChange={(e) => setField("registrationCloses", e.target.value)}
            />
            <Input
              label="Submission opens"
              type="datetime-local"
              value={form.submissionOpens}
              onChange={(e) => setField("submissionOpens", e.target.value)}
            />
            <Input
              label="Submission deadline"
              type="datetime-local"
              required
              value={form.submissionDeadline}
              onChange={(e) => setField("submissionDeadline", e.target.value)}
            />
            <Input
              label="Judging starts"
              type="datetime-local"
              value={form.judgingStarts}
              onChange={(e) => setField("judgingStarts", e.target.value)}
            />
            <Input
              label="Judging ends"
              type="datetime-local"
              value={form.judgingEnds}
              onChange={(e) => setField("judgingEnds", e.target.value)}
            />
            <Input
              label="Results announced"
              type="datetime-local"
              required
              value={form.resultsAnnounced}
              onChange={(e) => setField("resultsAnnounced", e.target.value)}
            />
          </div>
        </section>

        {/* Participation */}
        <section className="flex flex-col gap-5 border-t border-line pt-8">
          <h2 className="text-h3 text-primary">Participation & teams</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Min team size"
              type="number"
              min={1}
              value={form.minTeamSize}
              onChange={(e) => setField("minTeamSize", Number(e.target.value))}
            />
            <Input
              label="Max team size"
              type="number"
              min={1}
              value={form.maxTeamSize}
              onChange={(e) => setField("maxTeamSize", Number(e.target.value))}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-6">
            <Checkbox
              label="Solo participation allowed"
              checked={form.soloAllowed}
              onChange={(e) => setField("soloAllowed", e.target.checked)}
            />
            <Checkbox
              label="Cover image required for submissions"
              checked={form.coverImageRequired}
              onChange={(e) => setField("coverImageRequired", e.target.checked)}
            />
          </div>
        </section>

        {/* Actions */}
        <div className="sticky bottom-4 bg-surface-1 border border-line rounded-card p-4 flex justify-between items-center gap-4 shadow-modal">
          <Button variant="ghost" size="md" type="button" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button variant="primary" size="md" type="submit" isLoading={busy}>
            {edit ? "Update event" : "Save event draft"}
          </Button>
        </div>
      </form>
    </div>
  );
}
