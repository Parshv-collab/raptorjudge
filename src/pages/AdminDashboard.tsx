import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { humanizeConvexError } from "@/lib/errors";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard, SkeletonStat } from "@/components/ui/SkeletonCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { usePrimaryEvent } from "@/lib/featuredEvent";
import { formatDateTime } from "@/lib/format";
import {
  Users,
  CalendarDays,
  ClipboardList,
  ScrollText,
  ShieldCheck,
  Mail,
  Scale,
} from "lucide-react";

const QUICK_LINKS = [
  {
    to: "/admin/users",
    icon: <Users />,
    title: "Users",
    description: "Roles, disables, force logout, deletion.",
  },
  {
    to: "/admin/events",
    icon: <CalendarDays />,
    title: "Events",
    description: "Platform-wide lifecycle and ownership.",
  },
  {
    to: "/admin/judging",
    icon: <Scale />,
    title: "Judging",
    description: "Every assignment across every event.",
  },
  {
    to: "/admin/invites",
    icon: <Mail />,
    title: "Invites",
    description: "Staff access tokens and revocation.",
  },
];

export default function AdminDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const me = useQuery(api.users.me, skip ? "skip" : {});
  const events = useQuery(api.events.listAll, skip ? "skip" : {});
  const users = useQuery(api.users.list, skip ? "skip" : {});
  const { event: primaryEvent } = usePrimaryEvent();
  const event = skip ? primaryEvent : (events?.[0] ?? primaryEvent);
  const submissions = useQuery(api.submissions.byEvent, skip || !event ? "skip" : { eventId: event._id });
  const audit = useQuery(api.audit.list, skip ? "skip" : { limit: 10 });
  // In-app acceptance self-check: same checks the REST report runs, stored so
  // the result survives a reload instead of living only in the response body.
  const latestReport = useQuery(api.acceptance.latestReport, skip ? "skip" : {});
  const runSuite = useMutation(api.acceptance.runSuite);
  const saveReport = useMutation(api.acceptance.saveReport);
  const [checkBusy, setCheckBusy] = useState(false);

  // The stored report is JSON text so it can grow without a schema change.
  const parsedReport = useMemo(() => {
    if (!latestReport) return null;
    try {
      return JSON.parse(latestReport) as { summary?: string; runAt?: number; checks?: any[] };
    } catch {
      return null;
    }
  }, [latestReport]);
  const reportSummary = parsedReport?.summary ?? "";
  const reportPassedAt = parsedReport?.runAt ?? null;
  const reportChecks = parsedReport?.checks ?? [];

  async function handleRunAcceptance() {
    setCheckBusy(true);
    try {
      const report = await runSuite({});
      await saveReport({ report: JSON.stringify(report) });
      toast.success(report.summary);
    } catch (err) {
      toast.error(humanizeConvexError(err));
    } finally {
      setCheckBusy(false);
    }
  }

  if (authLoading || !isAuthenticated || me === undefined || !events || !users) {
    return (
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </div>
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (me && me.role !== "admin") {
    return <Navigate to={me.role === "organizer" ? "/organizer" : "/home"} replace />;
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="System administration"
        description="Platform-wide users, events and the tamper-evident audit trail."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Users" value={users.length} subtext="All roles" icon={<Users />} />
        <StatCard label="Events" value={events.length} subtext="Every lifecycle stage" icon={<CalendarDays />} />
        <StatCard
          label="Submissions"
          value={submissions?.length ?? 0}
          subtext={event ? event.title : "—"}
          icon={<ClipboardList />}
        />
        <StatCard label="Audit entries" value={audit?.length ?? 0} subtext="Latest 10 shown below" icon={<ScrollText />} />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {QUICK_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="group">
            <div className="h-full bg-surface-1 border border-line rounded-card p-6 flex flex-col justify-between transition-colors duration-fast group-hover:border-line-strong">
              <div>
                <div className="text-muted mb-3 [&>svg]:w-5 [&>svg]:h-5">{link.icon}</div>
                <h3 className="text-h3 text-primary">{link.title}</h3>
                <p className="text-[13px] text-secondary mt-1">{link.description}</p>
              </div>
              <span className="text-[13px] font-medium text-accent mt-5 group-hover:text-accent-hover transition-colors duration-fast">
                Open →
              </span>
            </div>
          </Link>
        ))}
        <Link to="/security" className="group">
          <div className="h-full bg-surface-1 border border-line rounded-card p-6 flex flex-col justify-between transition-colors duration-fast group-hover:border-line-strong">
            <div>
              <div className="text-muted mb-3 [&>svg]:w-5 [&>svg]:h-5">
                <ShieldCheck />
              </div>
              <h3 className="text-h3 text-primary">Security</h3>
              <p className="text-[13px] text-secondary mt-1">Two-factor authentication for privileged roles.</p>
            </div>
            <span className="text-[13px] font-medium text-accent mt-5 group-hover:text-accent-hover transition-colors duration-fast">
              Open →
            </span>
          </div>
        </Link>
      </div>

      {/* Acceptance self-check */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-h2 text-primary">Acceptance self-check</h2>
            <p className="text-[13px] text-secondary mt-0.5">
              Re-runs the platform's own integrity checks (role isolation, result gating,
              audit chain) against the live data. Same suite as <code className="font-mono text-[12px]">GET /api/v1/acceptance</code>.
            </p>
          </div>
          <Button variant="secondary" size="sm" isLoading={checkBusy} onClick={handleRunAcceptance}>
            Run checks
          </Button>
        </div>

        {latestReport ? (
          <div className="bg-surface-1 border border-line rounded-card p-5 flex flex-col gap-3">
            <p className="text-[13px] text-primary font-medium">{reportSummary}</p>
            {reportPassedAt ? (
              <p className="text-[12px] text-muted tnum">
                Last run {formatDateTime(reportPassedAt)}
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              {reportChecks.slice(0, 6).map((c: any) => (
                <div
                  key={`${c.tier}-${c.id}`}
                  className="flex items-center justify-between gap-3 text-[13px]"
                >
                  <span className="text-secondary truncate">
                    <span className="font-mono text-[11px] text-muted mr-2">{c.id}</span>
                    {c.description}
                  </span>
                  <Badge variant={c.skipped ? "default" : c.pass ? "success" : "danger"}>
                    {c.skipped ? "skipped" : c.pass ? "pass" : "fail"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<ShieldCheck />}
            title="No self-check stored yet"
            description="Run the checks once and the report is kept here for the rest of the deployment."
          />
        )}
      </section>

      {/* Recent audit */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-h2 text-primary">Recent audit trail</h2>
          <Link
            to="/admin/audit"
            className="text-[13px] text-accent hover:text-accent-hover transition-colors duration-fast"
          >
            Full trail →
          </Link>
        </div>

        {audit === undefined ? (
          <SkeletonCard lines={5} />
        ) : audit.length === 0 ? (
          <EmptyState
            icon={<ScrollText />}
            title="No audit entries yet"
            description="Privileged writes — role changes, publishes, deletes — will appear here as they happen."
          />
        ) : (
          <div className="bg-surface-1 border border-line rounded-card divide-y divide-[color:var(--color-border)]">
            {audit.map((log: any) => (
              <div key={log.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-[12px] font-medium text-primary">{log.action}</span>
                  <Badge>{log.targetType}</Badge>
                </div>
                <span className="font-mono text-[12px] text-muted tnum">
                  {formatDateTime(log.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
