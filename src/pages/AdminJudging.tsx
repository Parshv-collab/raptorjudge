import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";

export default function AdminJudging() {
  const assignments = useQuery(api.admin.listAllAssignments, {});
  const users = useQuery(api.users.list, {});
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
      toast.success("Judge reassigned successfully.");
      setSelectedAssignment(null);
    } catch (err: any) {
      toast.error(err.message || "Reassignment failed");
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
          System Overview
        </span>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
          Judge Assignments
        </h1>
      </div>

      <GlassCard className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/10 font-bold uppercase tracking-wider text-[#6e6e73]">
                <th className="py-3 px-4">Event</th>
                <th className="py-3 px-4">Project</th>
                <th className="py-3 px-4">Assigned Judge</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(assignments || []).map((a: any) => (
                <tr key={a.assignmentId} className="border-b border-black/5 hover:bg-white/40">
                  <td className="py-3.5 px-4 font-bold text-[#1d1d1f]">{a.eventTitle}</td>
                  <td className="py-3.5 px-4">{a.projectTitle}</td>
                  <td className="py-3.5 px-4 font-medium">{a.judgeName} ({a.judgeEmail})</td>
                  <td className="py-3.5 px-4 font-semibold uppercase text-[10px] text-[#ff0055]">
                    {a.status}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Button variant="secondary" size="sm" onClick={() => setSelectedAssignment(a)}>
                      Reassign
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!assignments || assignments.length === 0) && (
            <p className="text-xs text-[#6e6e73] text-center py-6">No judge assignments found.</p>
          )}
        </div>
      </GlassCard>

      <Modal
        isOpen={!!selectedAssignment}
        onClose={() => setSelectedAssignment(null)}
        title="Reassign Judge"
        description={`Reassign project "${selectedAssignment?.projectTitle}" to a different judge`}
      >
        <div className="flex flex-col gap-4 mt-2">
          <Dropdown
            label="Select Judge"
            options={judges.map((j: any) => ({
              value: j._id,
              label: `${j.name || j.email} (${j.email})`,
            }))}
            value={targetJudge}
            onChange={(v) => setTargetJudge(v)}
          />

          <div className="flex justify-between items-center mt-4">
            <Button variant="ghost" size="md" onClick={() => setSelectedAssignment(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={handleConfirmReassign}>
              Confirm Reassignment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
