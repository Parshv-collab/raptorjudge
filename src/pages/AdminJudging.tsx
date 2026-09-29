import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard, SkeletonTable } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Scale } from "lucide-react";

export default function AdminJudging() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const assignments = useQuery(api.admin.listAllAssignments, skip ? "skip" : {});
  const users = useQuery(api.users.list, skip ? "skip" : {});
  const reassign = useMutation(api.admin.reassignJudge);

  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [targetJudge, setTargetJudge] = useState("");

  const judges = (users || []).filter((u: any) => u.role === "judge");

  async function handleConfirmReassign() {
    if (!selectedAssignment || !targetJudge) return;
    try {
      await reassign({
        assignmentId: selectedAssignment.assignmentId as any,
        newJudgeId: targetJudge as any,
      });
      toast.success("Judge reassigned.");
      setSelectedAssignment(null);
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonTable rows={8} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Judge assignments"
        description="Every assignment across every event. Rebalance manually when a judge drops out."
      />

      {assignments === undefined || users === undefined ? (
        <SkeletonTable rows={8} />
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={<Scale />}
          title="No judge assignments"
          description="Assignments are created from each event's organizer console via fair distribution or manual assignment."
        />
      ) : (
        <Table caption="Judge assignments">
          <THead>
            <tr>
              <TH>Event</TH>
              <TH>Project</TH>
              <TH>Judge</TH>
              <TH>Status</TH>
              <TH numeric>Actions</TH>
            </tr>
          </THead>
          <tbody>
            {assignments.map((a: any) => (
              <TR key={a.assignmentId}>
                <TD>
                  <span className="font-medium">{a.eventTitle}</span>
                </TD>
                <TD>
                  <span className="text-secondary">{a.projectTitle}</span>
                </TD>
                <TD>
                  <div className="flex flex-col">
                    <span className="font-medium">{a.judgeName}</span>
                    <span className="font-mono text-[12px] text-muted">{a.judgeEmail}</span>
                  </div>
                </TD>
                <TD>
                  <Badge variant={a.status === "completed" ? "success" : "default"}>{a.status}</Badge>
                </TD>
                <TD numeric>
                  <Button variant="secondary" size="sm" onClick={() => setSelectedAssignment(a)}>
                    Reassign
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {/* Reassign modal */}
      <Modal
        isOpen={!!selectedAssignment}
        onClose={() => setSelectedAssignment(null)}
        title="Reassign judge"
        description={`Reassign "${selectedAssignment?.projectTitle}" to a different judge.`}
      >
        <div className="flex flex-col gap-4 mt-2">
          <Dropdown
            label="New judge"
            options={judges.map((j: any) => ({
              value: j._id,
              label: `${j.name || j.email} (${j.email})`,
            }))}
            value={targetJudge}
            onChange={(v) => setTargetJudge(v)}
          />

          <div className="flex justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => setSelectedAssignment(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!targetJudge} onClick={handleConfirmReassign}>
              Confirm reassignment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
