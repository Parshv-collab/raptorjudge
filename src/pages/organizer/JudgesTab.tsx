import { useState } from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { Modal } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { humanizeConvexError } from "@/lib/errors";

export function JudgesTab({ eventId, judgingLocked = false }: { eventId: any; judgingLocked?: boolean }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const progress = useQuery(api.judging.progress, skip || !eventId ? "skip" : { eventId });
  const submissions = useQuery(api.submissions.byEvent, skip || !eventId ? "skip" : { eventId });
  const users = useQuery(api.users.list, skip ? "skip" : {});
  const tracks = useQuery(api.tracks.listByEvent, skip || !eventId ? "skip" : { eventId });
  const judgeTracks = useQuery(api.judging.getJudgeTracks, skip ? "skip" : {});
  const runAssignment = useMutation(api.judging.runAssignment);
  const assignProjects = useMutation(api.judging.assignProjects);
  const setJudgeTracks = useMutation(api.judging.setJudgeTracks);

  const [busy, setBusy] = useState(false);
  const [k, setK] = useState(3);
  const [cap, setCap] = useState(8);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedJudgeId, setSelectedJudgeId] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [trackJudgeId, setTrackJudgeId] = useState("");

  const judgesList = (users || []).filter((u: any) => u.role === "judge");

  // Dry-run of the assignment planner for the current k / cap. It is a query,
  // so the preview updates live as the organizer tunes the inputs.
  const preview = useQuery(
    api.judging.previewAssignment,
    skip || !eventId ? "skip" : { eventId, minJudgesPerSubmission: k, maxAssignmentsPerJudge: cap },
  );

  async function handleAlgorithmicAssign() {
    setBusy(true);
    try {
      const res = await runAssignment({
        eventId,
        minJudgesPerSubmission: k,
        maxAssignmentsPerJudge: cap,
      });
      toast.success(
        `Assigned ${res.totalAssignments} projects across judges (k=${k}, cap=${res.maxAssignmentsPerJudge}).`,
      );
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTracks(judgeId: string, ids: string[]) {
    try {
      await setJudgeTracks({ eventId, judgeId: judgeId as never, tracks: ids });
      toast.success("Judge track specialisation saved.");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    }
  }

  async function handleManualAssign() {
    if (!selectedJudgeId || selectedProjectIds.length === 0) return;
    setBusy(true);
    try {
      const res = await assignProjects({
        eventId,
        judgeId: selectedJudgeId as never,
        submissionIds: selectedProjectIds as never,
      });
      toast.success(`Assigned ${res.count} projects to judge.`);
      setAssignModalOpen(false);
      setSelectedProjectIds([]);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Assignment preview (dry run — writes nothing) */}
      <Modal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title="Assignment preview (dry run)"
        description="Nothing is written until you click Distribute fairly."
        maxWidth="lg"
      >
        <div className="flex flex-col gap-4 mt-2 max-h-[70vh] overflow-y-auto">
          {preview === undefined ? (
            <SkeletonCard lines={4} />
          ) : !preview.ok || !preview.plan ? (
            <EmptyState
              title="Cannot preview"
              description={preview.reason ?? "Cannot preview an assignment plan right now."}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="p-3 rounded-input bg-surface-2 border border-line">
                  <span className="text-muted">Total assignments</span>
                  <p className="text-h3 text-primary tnum">{preview.plan.totalAssignments}</p>
                </div>
                <div className="p-3 rounded-input bg-surface-2 border border-line">
                  <span className="text-muted">Projects with ≥ k judges</span>
                  <p className="text-h3 text-primary tnum">
                    {preview.plan.perSubmission.filter((s: any) => s.judgeCount >= k).length} /{" "}
                    {preview.plan.perSubmission.length}
                  </p>
                </div>
                <div className="p-3 rounded-input bg-surface-2 border border-line">
                  <span className="text-muted">Conflicts avoided</span>
                  <p className="text-h3 text-success tnum">{preview.plan.conflictsAvoided.length}</p>
                </div>
                <div className="p-3 rounded-input bg-surface-2 border border-line">
                  <span className="text-muted">Load cap</span>
                  <p className="text-h3 text-primary tnum">{preview.plan.maxAssignmentsPerJudge}</p>
                </div>
              </div>

              {preview.plan.capReached.length > 0 && (
                <p className="text-[13px] text-warning bg-warning/5 border border-warning/40 rounded-input p-3">
                  {preview.plan.capReached.length} judge(s) hit the load cap:{" "}
                  {preview.plan.capReached.map((c: any) => c.name).join(", ")}. Raise the cap or add
                  more judges to cover everything.
                </p>
              )}

              {preview.plan.unstaffedSubmissions.length > 0 && (
                <p className="text-[13px] text-danger bg-danger/5 border border-danger/40 rounded-input p-3">
                  {preview.plan.unstaffedSubmissions.length} project(s) would get no judges:{" "}
                  {preview.plan.unstaffedSubmissions.map((s: any) => s.title).join(", ")}.
                </p>
              )}

              <div>
                <h4 className="text-[13px] font-medium text-primary mb-2">Per-judge load</h4>
                <div className="flex flex-col gap-1.5">
                  {preview.plan.workload.map((w: any) => (
                    <div
                      key={w.judgeId}
                      className="flex items-center gap-3 text-[13px] px-3 py-2 rounded-input bg-surface-2 border border-line"
                    >
                      <span className="font-medium text-primary flex-1 truncate">{w.name}</span>
                      <div className="w-32">
                        <ProgressBar
                          value={w.load}
                          max={preview.plan.maxAssignmentsPerJudge || 1}
                          size="sm"
                        />
                      </div>
                      <span className="font-mono text-[12px] text-muted w-8 text-right tnum">{w.load}</span>
                    </div>
                  ))}
                  {preview.plan.workload.length === 0 && (
                    <p className="text-[13px] text-muted py-2">No judges to assign.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Assignment controls */}
      <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h3 className="text-h3 text-primary">Judge project assignments</h3>
          <p className="text-[13px] text-secondary mt-0.5">
            Invite judges and distribute submitted projects with conflict-of-interest awareness.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Issue 21+25: hidden once results are published — the server refuses
              these writes, so the buttons must not imply they would work. */}
          {!judgingLocked && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setInviteModalOpen(true)}>
                Invite judge
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setAssignModalOpen(true)}>
                Manual assign
              </Button>
            </>
          )}

          <label className="flex items-center gap-1.5 text-[13px] text-secondary ml-1">
            <span>k =</span>
            <input
              type="number"
              min={1}
              max={10}
              aria-label="Judges per submission"
              value={k}
              onChange={(e) => setK(Number(e.target.value))}
              className="w-14 h-8 px-1 text-center rounded-input bg-surface-2 border border-line text-[13px] text-primary tnum focus:border-accent focus:outline-2 focus:outline-accent/40"
            />
          </label>

          <label className="flex items-center gap-1.5 text-[13px] text-secondary">
            <span>cap =</span>
            <input
              type="number"
              min={1}
              max={40}
              aria-label="Maximum assignments per judge"
              value={cap}
              onChange={(e) => setCap(Number(e.target.value))}
              className="w-14 h-8 px-1 text-center rounded-input bg-surface-2 border border-line text-[13px] text-primary tnum focus:border-accent focus:outline-2 focus:outline-accent/40"
            />
          </label>

          {!judgingLocked && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setPreviewModalOpen(true)}>
                Preview
              </Button>
              <Button variant="primary" size="sm" isLoading={busy} onClick={handleAlgorithmicAssign}>
                Distribute fairly
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Track specialisation */}
      <div className="bg-surface-1 border border-line rounded-card p-6">
        <h3 className="text-h3 text-primary">Judge track specialisation</h3>
        <p className="text-[13px] text-secondary mt-0.5 mb-4">
          The assigner prefers judges whose specialisation matches a project's track, then falls back
          to load balancing.
        </p>
        <Dropdown
          label="Select judge"
          options={[
            { value: "", label: "Choose a judge…" },
            ...judgesList.map((j: any) => ({
              value: j._id,
              label: `${j.name || j.email} (${(judgeTracks?.[j._id] || []).length} track(s))`,
            })),
          ]}
          value={trackJudgeId}
          onChange={(v) => setTrackJudgeId(v)}
        />
        {trackJudgeId && (
          <div className="mt-4">
            <ChipGroup
              label="Tracks this judge specialises in"
              options={(tracks || []).map((t: any) => ({ id: t.name, label: t.name }))}
              selectedIds={judgeTracks?.[trackJudgeId] || []}
              onChange={(ids) => handleSaveTracks(trackJudgeId, ids)}
            />
          </div>
        )}
      </div>

      {/* Workload & progress */}
      <div className="bg-surface-1 border border-line rounded-card p-6">
        <h3 className="text-h3 text-primary mb-4">Judge workload & progress</h3>

        <div className="flex flex-col gap-3">
          {(progress?.perJudge || []).map((judge: any) => (
            <div
              key={judge.judgeId}
              className="px-4 py-3 rounded-input bg-surface-2 border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[13px]"
            >
              <div className="min-w-0">
                <span className="font-medium text-primary">{judge.name}</span>
                <span className="text-muted ml-2 font-mono text-[12px] tnum">
                  {judge.completed}/{judge.total} scored
                </span>
              </div>
              <div className="w-full sm:w-48 shrink-0">
                <ProgressBar value={judge.completed} max={judge.total || 1} size="sm" />
              </div>
            </div>
          ))}

          {/* Only once the progress query has resolved — while it is `undefined`
              the condition below is trivially true and the panel would flash
              "No assignments yet" at an organizer who has every judge assigned. */}
          {progress !== undefined &&
            (!progress.perJudge || progress.perJudge.length === 0) && (
              <EmptyState
                title="No assignments yet"
                description='Click "Distribute fairly" or "Manual assign" to give judges their scoring queues.'
              />
            )}
        </div>
      </div>

      {/* Manual assignment modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Manual project assignment"
        description="Select a judge and choose the projects to assign directly."
        maxWidth="lg"
      >
        <div className="flex flex-col gap-4 mt-2">
          <Dropdown
            label="Judge"
            options={[
              { value: "", label: "Choose a judge…" },
              ...judgesList.map((j: any) => ({ value: j._id, label: `${j.name || j.email} (${j.email})` })),
            ]}
            value={selectedJudgeId}
            onChange={(v) => setSelectedJudgeId(v)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-secondary">Submissions</label>
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1 p-2 rounded-input bg-surface-2 border border-line">
              {(submissions || []).map((sub: any) => {
                const isSelected = selectedProjectIds.includes(sub._id);
                return (
                  <button
                    key={sub._id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedProjectIds(selectedProjectIds.filter((id) => id !== sub._id));
                      } else {
                        setSelectedProjectIds([...selectedProjectIds, sub._id]);
                      }
                    }}
                    className={`px-3 py-2 rounded-btn text-left text-[13px] flex justify-between items-center transition-colors duration-fast ${
                      isSelected
                        ? "bg-accent/10 text-accent font-medium"
                        : "text-primary hover:bg-surface-1"
                    }`}
                  >
                    <span className="truncate">{sub.title}</span>
                    <span className="shrink-0 ml-3 text-[12px]">{isSelected ? "Selected" : "Add"}</span>
                  </button>
                );
              })}
              {(!submissions || submissions.length === 0) && (
                <p className="text-[13px] text-muted text-center py-4">No submissions to assign yet.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={busy}
              disabled={!selectedJudgeId || selectedProjectIds.length === 0}
              onClick={handleManualAssign}
            >
              Assign {selectedProjectIds.length} project{selectedProjectIds.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Invite judge modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite a judge"
        description="Share this registration link — anyone signing up through it becomes a judge."
      >
        <div className="flex flex-col gap-4 mt-2">
          <Input
            label="Judge invitation link"
            value={`${window.location.origin}/auth?role=judge`}
            readOnly
            className="font-mono text-[13px]"
          />
          <Button
            variant="primary"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/auth?role=judge`);
              toast.success("Judge invite link copied.");
              setInviteModalOpen(false);
            }}
          >
            Copy invite link
          </Button>
        </div>
      </Modal>
    </div>
  );
}
