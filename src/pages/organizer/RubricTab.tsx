import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { humanizeConvexError } from "@/lib/errors";

export function RubricTab({
  eventId,
  rubricData,
  customizeRubric,
  deleteCriterion,
}: {
  eventId: any;
  rubricData: any;
  customizeRubric: any;
  deleteCriterion: any;
}) {
  const upsertCriterion = useMutation(api.judging.upsertCriterion);
  const lockRubric = useMutation(api.judging.lockRubric);
  const unlockRubric = useMutation(api.judging.unlockRubric);
  const me = useQuery(api.users.me, {});
  const isAdmin = me?.role === "admin";
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCriterion, setEditCriterion] = useState<any>(null);
  const [allowMismatch, setAllowMismatch] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState(0.25);
  const [minScore, setMinScore] = useState(1);
  const [maxScore, setMaxScore] = useState(10);
  const [, setSortOrder] = useState(10);

  const criteria = rubricData?.criteria || [];
  const isDefault = rubricData?.isDefault;
  const locked = rubricData?.locked;

  const totalWeight = criteria.reduce((acc: number, c: any) => acc + (c.weight || 0), 0);
  const isWeightValid = Math.abs(totalWeight - 1.0) <= 0.001;

  // Live weight preview inside the modal: what the rubric would sum to after
  // saving this criterion (the edit form is where mistakes are made).
  const editingId = String(editCriterion?._id ?? editCriterion?.id ?? "");
  const siblingWeight = criteria
    .filter((c: any) => String(c._id || c.id) !== editingId)
    .reduce((acc: number, c: any) => acc + (c.weight || 0), 0);
  const projectedWeight = siblingWeight + Number(weight || 0);
  const projectedValid = Math.abs(projectedWeight - 1.0) <= 0.001;

  async function handleLock() {
    setBusy(true);
    try {
      await lockRubric({ eventId });
      toast.success("Rubric locked. Judge scores can no longer be affected by rubric edits.");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setBusy(true);
    try {
      await unlockRubric({ eventId });
      toast.success("Rubric unlocked.");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCustomize() {
    setBusy(true);
    try {
      await customizeRubric({ eventId });
      toast.success("Rubric customized.");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  function handleOpenModal(c?: any) {
    if (c) {
      setEditCriterion(c);
      setName(c.name);
      setDescription(c.description || "");
      setWeight(c.weight);
      setMinScore(c.minScore);
      setMaxScore(c.maxScore);
      setSortOrder(c.sortOrder || 10);
    } else {
      setEditCriterion(null);
      setName("");
      setDescription("");
      setWeight(0.25);
      setMinScore(1);
      setMaxScore(10);
      setSortOrder((criteria.length + 1) * 10);
    }
    setAllowMismatch(false);
    setModalOpen(true);
  }

  async function handleSaveCriterion(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (minScore >= maxScore) {
      toast.error("Min score must be less than max score.");
      return;
    }
    setBusy(true);
    try {
      if (isDefault) {
        await customizeRubric({ eventId });
      }
      await upsertCriterion({
        eventId,
        criterionId: editCriterion?._id || editCriterion?.id,
        name: name.trim(),
        description: description.trim(),
        weight: Number(weight),
        minScore: Number(minScore),
        maxScore: Number(maxScore),
        allowWeightMismatch: allowMismatch,
      });
      toast.success(editCriterion ? "Criterion updated." : "Criterion added.");
      setModalOpen(false);
      setAllowMismatch(false);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCriterion({ eventId, criterionId: deleteTarget.id as never });
      toast.success("Criterion deleted.");
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Default-rubric banner */}
      {isDefault && (
        <div className="p-4 rounded-card bg-warning/5 border border-warning/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-[13px] text-warning">
          <div>
            <p className="font-medium">You're using the default rubric.</p>
            <p className="mt-0.5 text-secondary">
              Judges can score, but customizing the criteria usually fits the event better.
            </p>
          </div>
          <Button variant="secondary" size="sm" isLoading={busy} onClick={handleCustomize} className="shrink-0">
            Customize rubric
          </Button>
        </div>
      )}

      {/* Rubric controls */}
      <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-h3 text-primary">Rubric criteria</h3>
            {locked && <Badge variant="danger">Locked</Badge>}
            {isDefault && <Badge variant="warning">Default</Badge>}
          </div>
          <p className="text-[13px] mt-1.5">
            <span className="text-secondary">Total weight: </span>
            <span className={`font-medium tnum ${isWeightValid ? "text-success" : "text-danger"}`}>
              {totalWeight.toFixed(3)} / 1.000
            </span>{" "}
            {isWeightValid ? (
              <span className="text-success">— valid</span>
            ) : (
              <span className="text-danger">— weights must sum to 1.000</span>
            )}
          </p>
          {locked && rubricData?.lockReason && (
            <p className="text-[12px] text-muted mt-1">{rubricData.lockReason}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {!locked && (
            <Button variant="secondary" size="sm" onClick={() => handleOpenModal()}>
              Add criterion
            </Button>
          )}
          {!locked && (
            <Button variant="secondary" size="sm" isLoading={busy} onClick={handleLock}>
              Lock rubric
            </Button>
          )}
          {rubricData?.lockedExplicitly && isAdmin && (
            <Button variant="secondary" size="sm" isLoading={busy} onClick={handleUnlock}>
              Unlock (admin)
            </Button>
          )}
          {rubricData?.lockedExplicitly && !isAdmin && (
            <span className="text-[12px] text-muted self-center max-w-[200px]">
              Locked explicitly — an admin must unlock it.
            </span>
          )}
        </div>
      </div>

      {/* Criteria table */}
      {criteria.length === 0 ? (
        <EmptyState
          title="No criteria defined"
          description="Add weighted criteria so judges know what to evaluate. Weights must sum to 1.000 before scoring opens."
          actionLabel={locked ? undefined : "Add criterion"}
          onAction={locked ? undefined : () => handleOpenModal()}
        />
      ) : (
        <div className="w-full overflow-x-auto border border-line rounded-card bg-surface-1">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="px-4 h-10 text-left text-[12px] font-medium uppercase tracking-[0.05em] text-muted border-b border-line whitespace-nowrap">Name</th>
                <th className="px-4 h-10 text-left text-[12px] font-medium uppercase tracking-[0.05em] text-muted border-b border-line whitespace-nowrap">Description</th>
                <th className="px-4 h-10 text-left text-[12px] font-medium uppercase tracking-[0.05em] text-muted border-b border-line whitespace-nowrap">Weight</th>
                <th className="px-4 h-10 text-left text-[12px] font-medium uppercase tracking-[0.05em] text-muted border-b border-line whitespace-nowrap">Score range</th>
                <th className="px-4 h-10 text-right text-[12px] font-medium uppercase tracking-[0.05em] text-muted border-b border-line whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c: any) => (
                <tr key={c.id || c._id} className="hover:bg-surface-2 transition-colors duration-fast">
                  <td className="px-4 h-12 align-middle font-medium text-primary">{c.name}</td>
                  <td className="px-4 h-12 align-middle text-secondary max-w-xs truncate">{c.description}</td>
                  <td className="px-4 h-12 align-middle font-mono text-[13px] text-accent tnum">
                    {(c.weight * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 h-12 align-middle font-mono text-[13px] text-secondary tnum">
                    {c.minScore}–{c.maxScore}
                  </td>
                  <td className="px-4 h-12 align-middle">
                    {!locked && (
                      <div className="flex gap-1.5 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenModal(c)}>
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          aria-label={`Delete criterion ${c.name}`}
                          onClick={() => setDeleteTarget({ id: c._id || c.id, name: c.name })}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Judge-view preview */}
      <div className="bg-surface-1 border border-line rounded-card p-6">
        <h3 className="text-[15px] font-semibold text-primary mb-4">Judge view preview</h3>
        <div className="p-4 rounded-input bg-surface-2 border border-line flex flex-col gap-4">
          {criteria.map((c: any) => (
            <div key={c.id || c._id} className="flex flex-col gap-1 text-[13px]">
              <div className="flex justify-between font-medium text-primary">
                <span>
                  {c.name} <span className="text-muted">({Math.round(c.weight * 100)}%)</span>
                </span>
                <span className="font-mono text-[12px] text-secondary tnum">
                  {c.minScore}–{c.maxScore}
                </span>
              </div>
              {c.description && <p className="text-[12px] text-muted">{c.description}</p>}
              <input
                type="range"
                disabled
                min={c.minScore}
                max={c.maxScore}
                aria-label={`${c.name} score preview (disabled)`}
                className="w-full accent-[color:var(--color-accent)] opacity-60"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete criterion"
        description={
          deleteTarget
            ? `Delete “${deleteTarget.name}”? The remaining weights will no longer sum to 1.000, so judges cannot submit scores until you fix them. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete criterion"
        destructive
        isLoading={deleting}
      />

      {/* Add / edit criterion modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editCriterion ? "Edit criterion" : "Add criterion"}
      >
        <form onSubmit={handleSaveCriterion} className="flex flex-col gap-4 mt-2">
          <Input
            label="Name"
            required
            placeholder="e.g. Innovation"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            label="Description"
            rows={2}
            placeholder="e.g. Originality and novelty of the idea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Live weight validation */}
          <div
            className={`p-3 rounded-input border text-[13px] font-medium flex items-center justify-between ${
              projectedValid
                ? "bg-success/5 border-success/40 text-success"
                : "bg-warning/5 border-warning/40 text-warning"
            }`}
            role="status"
          >
            <span>
              Weights would sum to <strong className="tnum">{projectedWeight.toFixed(3)}</strong>
              {projectedValid ? " — valid" : " — should be 1.000"}
            </span>
            <span aria-hidden="true">{projectedValid ? "✓" : "⚠"}</span>
          </div>

          {!projectedValid && (
            <label className="flex items-start gap-2.5 text-[13px] text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={allowMismatch}
                onChange={(e) => setAllowMismatch(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded-[4px] appearance-none border border-line-strong bg-surface-1 checked:bg-accent checked:border-accent cursor-pointer shrink-0"
              />
              <span>
                Save anyway as a draft rubric. Judges cannot submit scores until the weights sum to 1.000.
              </span>
            </label>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Weight (0–1)"
              type="number"
              step="0.05"
              min="0"
              max="1"
              required
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
            />
            <Input
              label="Min score"
              type="number"
              required
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
            />
            <Input
              label="Max score"
              type="number"
              required
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value))}
            />
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={busy}
              type="submit"
              disabled={!projectedValid && !allowMismatch}
            >
              Save criterion
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
