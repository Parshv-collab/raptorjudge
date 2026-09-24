import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";

export default function AdminAudit() {
  const auditLogs = useQuery(api.audit.list, { limit: 100 });
  const actionsList = useQuery(api.audit.actions, {});
  const verifyChain = useQuery(api.audit.verifyChain, {});

  const [selectedAction, setSelectedAction] = useState("all");
  const [searchActor, setSearchActor] = useState("");

  const filteredLogs = useMemo(() => {
    return (auditLogs || []).filter((log: any) => {
      const matchAction = selectedAction === "all" || log.action === selectedAction;
      const matchActor =
        !searchActor ||
        log.actorEmail?.toLowerCase().includes(searchActor.toLowerCase()) ||
        log.actorId?.toLowerCase().includes(searchActor.toLowerCase());
      return matchAction && matchActor;
    });
  }, [auditLogs, selectedAction, searchActor]);

  function handleExportCSV() {
    if (!filteredLogs || filteredLogs.length === 0) {
      toast.error("No audit logs to export.");
      return;
    }
    const headers = "ID,Timestamp,Actor,Action,TargetType,TargetID,IP\n";
    const rows = filteredLogs
      .map(
        (l: any) =>
          `"${l.id}","${new Date(l.timestamp).toISOString()}","${l.actorEmail || l.actorId}","${
            l.action
          }","${l.targetType}","${l.targetId}","${l.ipAddress || "127.0.0.1"}"`
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit log exported to CSV");
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-6">
      <Link to="/admin">
        <span className="text-xs font-semibold text-[#ff0055] hover:underline">
          ← Back to Admin Dashboard
        </span>
      </Link>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
              Audit Trail
            </span>
            {verifyChain && (
              <span
                className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full ${
                  verifyChain.valid
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-[#e63946]/10 text-[#e63946]"
                }`}
              >
                Hash Chain {verifyChain.valid ? "Intact ✓" : "Broken ✗"}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight">
            System Audit Log
          </h1>
        </div>

        <Button variant="primary" size="md" onClick={handleExportCSV}>
          Export to CSV
        </Button>
      </div>

      {/* Filters Bar */}
      <GlassCard className="p-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="w-full sm:flex-1">
          <Input
            placeholder="Filter by actor email..."
            value={searchActor}
            onChange={(e) => setSearchActor(e.target.value)}
          />
        </div>

        <div className="w-full sm:w-56">
          <Dropdown
            options={[
              { value: "all", label: "All Actions" },
              ...(actionsList || []).map((a: string) => ({ value: a, label: a })),
            ]}
            value={selectedAction}
            onChange={(v) => setSelectedAction(v)}
          />
        </div>
      </GlassCard>

      {/* Audit Table */}
      <GlassCard className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/10 font-bold uppercase tracking-wider text-[#6e6e73]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log: any) => (
                <tr key={log.id} className="border-b border-black/5 hover:bg-white/40 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-[#6e6e73]">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-[#1d1d1f]">
                    {log.actorEmail || log.actorId || "System"}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#6e6e73]">
                    {log.targetType}:{log.targetId?.substring(0, 12)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredLogs.length === 0 && (
            <p className="text-xs text-[#6e6e73] text-center py-8">
              No audit records match the current filter.
            </p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
