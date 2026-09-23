import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Input } from "@/components/ui/Input";

export function OrganizerEventManage() {
  const { slug } = useParams<{ slug: string }>();
  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const setStage = useMutation(api.events.setStage);
  const tracks = useQuery(api.tracks.listByEvent, event ? { eventId: event._id } : "skip");
  const submissions = useQuery(api.submissions.byEvent, event ? { eventId: event._id } : "skip");
  const createTrack = useMutation(api.tracks.create);

  const [activeTab, setActiveTab] = useState("overview");
  const [busy, setBusy] = useState(false);

  // New track state
  const [newTrackName, setNewTrackName] = useState("");
  const [newTrackDesc, setNewTrackDesc] = useState("");
  const [newTrackPrize, setNewTrackPrize] = useState("");

  if (!event) {
    return (
      <div className="py-20 text-center animate-pulse text-xs text-[#6e6e73]">
        Loading event management...
      </div>
    );
  }

  async function togglePublish() {
    if (!event) return;
    setBusy(true);
    try {
      const nextStage = event.status === "draft" ? "registration" : "draft";
      await setStage({ eventId: event._id, stage: nextStage });
      toast.success(`Event ${nextStage === "draft" ? "unpublished" : "published"}!`);
    } catch (e: any) {
      toast.error(e.message || "Could not change event stage");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddTrack() {
    if (!event || !newTrackName.trim()) return;
    setBusy(true);
    try {
      await createTrack({
        eventId: event._id,
        name: newTrackName.trim(),
        description: newTrackDesc.trim(),
        prizeDescription: newTrackPrize.trim(),
        prizeAmount: 0,
      });
      toast.success("Track created!");
      setNewTrackName("");
      setNewTrackDesc("");
      setNewTrackPrize("");
    } catch (e: any) {
      toast.error(e.message || "Failed to create track");
    } finally {
      setBusy(false);
    }
  }

  const tabItems = [
    { id: "overview", label: "Overview" },
    { id: "tracks", label: "Tracks & Prizes", badge: tracks?.length },
    { id: "judges", label: "Judges" },
    { id: "submissions", label: "Submissions", badge: submissions?.length },
    { id: "results", label: "Results" },
    { id: "audit", label: "Audit" },
  ];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-8">
      {/* Header */}
      <GlassCard className="p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
              {event.status}
            </span>
            <span className="text-xs text-[#6e6e73]">/{event.slug}</span>
          </div>
          <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight">{event.title}</h1>
        </div>

        <div className="flex gap-2 shrink-0">
          <Link to={`/organizer/events/${event.slug}/edit`}>
            <Button variant="secondary" size="md">
              Edit Details
            </Button>
          </Link>

          <Button
            variant={event.status === "draft" ? "primary" : "ghost"}
            size="md"
            isLoading={busy}
            onClick={togglePublish}
          >
            {event.status === "draft" ? "Publish Event" : "Unpublish to Draft"}
          </Button>
        </div>
      </GlassCard>

      {/* Tabs */}
      <Tabs tabs={tabItems} activeTab={activeTab} onChange={(id) => setActiveTab(id)} />

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <GlassCard className="p-6">
            <span className="text-xs font-semibold text-[#6e6e73]">Status</span>
            <p className="text-xl font-bold text-[#1d1d1f] mt-1 capitalize">{event.status}</p>
          </GlassCard>
          <GlassCard className="p-6">
            <span className="text-xs font-semibold text-[#6e6e73]">Team Size</span>
            <p className="text-xl font-bold text-[#1d1d1f] mt-1">
              {event.minTeamSize || 1} - {event.maxTeamSize || 4} Members
            </p>
          </GlassCard>
          <GlassCard className="p-6">
            <span className="text-xs font-semibold text-[#6e6e73]">Registration Deadline</span>
            <p className="text-sm font-bold text-[#1d1d1f] mt-1">
              {new Date(event.registrationEnd).toLocaleDateString()}
            </p>
          </GlassCard>
          <GlassCard className="p-6">
            <span className="text-xs font-semibold text-[#6e6e73]">Submission Deadline</span>
            <p className="text-sm font-bold text-[#1d1d1f] mt-1">
              {new Date(event.submissionDeadline).toLocaleDateString()}
            </p>
          </GlassCard>
        </div>
      )}

      {activeTab === "tracks" && (
        <div className="flex flex-col gap-6">
          <GlassCard className="p-6 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-[#1d1d1f]">Add New Track</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                placeholder="Track name"
                value={newTrackName}
                onChange={(e) => setNewTrackName(e.target.value)}
              />
              <Input
                placeholder="Description"
                value={newTrackDesc}
                onChange={(e) => setNewTrackDesc(e.target.value)}
              />
              <Input
                placeholder="Prize description"
                value={newTrackPrize}
                onChange={(e) => setNewTrackPrize(e.target.value)}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              isLoading={busy}
              disabled={!newTrackName.trim()}
              onClick={handleAddTrack}
              className="w-max"
            >
              Add Track
            </Button>
          </GlassCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(tracks || []).map((t: any) => (
              <GlassCard key={t._id} className="p-5">
                <h4 className="text-base font-bold text-[#1d1d1f]">{t.name}</h4>
                <p className="text-xs text-[#6e6e73] mt-1">{t.description}</p>
                {t.prizeDescription && (
                  <p className="text-xs font-bold text-[#ff0055] mt-2">
                    Prize: {t.prizeDescription}
                  </p>
                )}
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {activeTab === "submissions" && (
        <GlassCard className="p-6">
          <h3 className="text-base font-bold text-[#1d1d1f] mb-4">Submissions List</h3>
          <div className="flex flex-col gap-2">
            {(submissions || []).map((s: any) => (
              <div
                key={s._id}
                className="p-3.5 rounded-input bg-white/60 border border-white flex justify-between items-center text-xs"
              >
                <div>
                  <Link to={`/project/${s._id}`} className="font-bold text-[#1d1d1f] hover:underline">
                    {s.title}
                  </Link>
                  <p className="text-[#6e6e73]">Team: {s.teamName}</p>
                </div>
                <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-500/10 text-emerald-600">
                  {s.status}
                </span>
              </div>
            ))}
            {(!submissions || submissions.length === 0) && (
              <p className="text-xs text-[#6e6e73] text-center py-6">No submissions recorded.</p>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === "results" && (
        <GlassCard className="p-6 text-center">
          <h3 className="text-base font-bold text-[#1d1d1f] mb-2">Results & Rankings</h3>
          <p className="text-xs text-[#6e6e73] max-w-md mx-auto leading-relaxed">
            Final judging rankings and score normalization models are calculated after the judging phase closes.
          </p>
        </GlassCard>
      )}

      {(activeTab === "judges" || activeTab === "audit") && (
        <GlassCard className="p-6 text-center text-xs text-[#6e6e73]">
          Management view for {activeTab} is configured.
        </GlassCard>
      )}
    </div>
  );
}
