import { useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard, SkeletonTable } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScrollText, ShieldCheck, ShieldAlert } from "lucide-react";

export default function AdminAudit() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const auditLogs = useQuery(api.audit.list, skip ? "skip" : { limit: 100 });
  const actionsList = useQuery(api.audit.actions, skip ? "skip" : {});
  const verifyChain = useQuery(api.audit.verifyChain, skip ? "skip" : {});

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
      toast.error("No data to export yet");
      return;
    }
    const headers = ["ID", "Timestamp", "Actor", "Action", "TargetType", "TargetID", "IP"];
    const rows = filteredLogs.map((l: any) => [
      l.id,
      new Date(l.timestamp).toISOString(),
      l.actorEmail || l.actorId || "",
      l.action,
      l.targetType,
      l.targetId,
      l.ipAddress || "127.0.0.1",
    ]);

    downloadCsv(`audit-log-${Date.now()}.csv`, headers, rows);
    toast.success("Audit log exported to CSV");
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
        title="System audit log"
        description="Append-only, hash-chained record of every privileged write."
        actions={<Button variant="primary" onClick={handleExportCSV}>Export CSV</Button>}
      />

      {/* Chain integrity banner */}
      {verifyChain && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-card border ${
            verifyChain.valid
              ? "border-success/30 bg-success/5"
              : "border-danger/40 bg-danger/5"
          }`}
          role="status"
        >
          {verifyChain.valid ? (
            <ShieldCheck size={18} className="text-success shrink-0" />
          ) : (
            <ShieldAlert size={18} className="text-danger shrink-0" />
          )}
          <div className="text-[13px]">
            <span className={verifyChain.valid ? "text-success font-medium" : "text-danger font-medium"}>
              Hash chain {verifyChain.valid ? "intact" : "broken"}
              {verifyChain.brokenAt !== undefined && !verifyChain.valid
                ? ` at entry ${verifyChain.brokenAt}`
                : ""}
            </span>
            {verifyChain.entries !== undefined && (
              <span className="text-muted"> · {verifyChain.entries} entries verified</span>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface-1 border border-line rounded-card p-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="w-full sm:flex-1">
          <Input
            aria-label="Filter by actor"
            placeholder="Filter by actor email or ID…"
            value={searchActor}
            onChange={(e) => setSearchActor(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-56">
          <Dropdown
            options={[
              { value: "all", label: "All actions" },
              ...(actionsList || []).map((a: string) => ({ value: a, label: a })),
            ]}
            value={selectedAction}
            onChange={(v) => setSelectedAction(v)}
          />
        </div>
        <span className="text-[13px] text-muted tnum shrink-0">
          {filteredLogs.length} entr{filteredLogs.length === 1 ? "y" : "ies"}
        </span>
      </div>

      {/* Audit table */}
      {auditLogs === undefined ? (
        <SkeletonTable rows={8} />
      ) : filteredLogs.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title="No audit records"
          description={
            auditLogs.length === 0
              ? "Privileged writes will be recorded here with a tamper-evident hash chain."
              : "No audit records match the current filter."
          }
        />
      ) : (
        <Table caption="Audit log">
          <THead>
            <tr>
              <TH>Timestamp</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Target</TH>
            </tr>
          </THead>
          <tbody>
            {filteredLogs.map((log: any) => (
              <TR key={log.id}>
                <TD>
                  <span className="font-mono text-[12px] text-secondary tnum">
                    {formatDateTime(log.timestamp)}
                  </span>
                </TD>
                <TD>
                  <span className="font-medium">{log.actorEmail || log.actorId || "System"}</span>
                </TD>
                <TD>
                  <Badge variant="accent">{log.action}</Badge>
                </TD>
                <TD mono>
                  {log.targetType}:{log.targetId?.substring(0, 12)}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {/* Loading-state parity for the actions list */}
      {actionsList === undefined && <SkeletonCard lines={2} />}
    </div>
  );
}
