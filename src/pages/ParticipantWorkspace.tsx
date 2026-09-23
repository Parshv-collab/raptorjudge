import { useQuery, useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  Users,
  Copy,
  LogOut,
  Clock,
  Save,
  Send,
  Undo2,
  FileEdit,
  UserPlus,
  Trophy,
} from "lucide-react";

export default function ParticipantWorkspace() {
  const [searchParams] = useSearchParams();
  const eventSlug = searchParams.get("event") ?? "dogfood-2026";
  const event = useQuery(api.events.getBySlug, { slug: eventSlug });
  const tracks = useQuery(api.tracks.listByEvent, event ? { eventId: event._id } : "skip");
  const myTeam = useQuery(api.teams.myTeams, event ? { eventId: event._id } : "skip");
  const data = useQuery(api.submissions.mySubmission, event ? { eventId: event._id } : "skip");

  const createTeam = useMutation(api.teams.create);
  const joinTeam = useMutation(api.teams.joinByInviteCode);
  const leaveTeam = useMutation(api.teams.leave);
  const saveDraft = useMutation(api.submissions.saveDraft);
  const submitProj = useMutation(api.submissions.submit);
  const withdrawProj = useMutation(api.submissions.withdraw);

  const [draft, setDraft] = useState({
    title: "", tagline: "", description: "", repositoryUrl: "",
    videoUrl: "", demoUrl: "", tags: "", trackId: "",
  });
  const [dirty, setDirty] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  // load draft into form
  useEffect(() => {
    if (data?.submission && !dirty) {
      setDraft({
        title: data.submission.title ?? "",
        tagline: data.submission.tagline ?? "",
        description: data.submission.description ?? "",
        repositoryUrl: data.submission.repositoryUrl ?? "",
        videoUrl: data.submission.videoUrl ?? "",
        demoUrl: data.submission.demoUrl ?? "",
        tags: data.submission.tags ?? "",
        trackId: data.submission.trackId ?? "",
      });
    }
  }, [data?.submission?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // autosave every 4s when dirty
  useEffect(() => {
    if (!dirty || !event) return;
    const t = setTimeout(() => void doSave(), 4000);
    return () => clearTimeout(t);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  async function doSave() {
    if (!event) return;
    try {
      await saveDraft({
        eventId: event._id,
        title: draft.title,
        tagline: draft.tagline,
        description: draft.description,
        repositoryUrl: draft.repositoryUrl,
        videoUrl: draft.videoUrl,
        demoUrl: draft.demoUrl,
        tags: draft.tags,
        trackId: (draft.trackId || undefined) as never,
      });
      setDirty(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const team = myTeam?.[0];
  const submission = data?.submission;
  const isLocked: boolean =
    submission?.status === "submitted" || (!!event && Date.now() > event.submissionDeadline);
  const deadline = event ? new Date(event.submissionDeadline) : null;

  if (myTeam === undefined || event === undefined) {
    return <div className="container py-24 text-center font-mono text-muted-foreground">loading…</div>;
  }

  return (
    <div className="container max-w-4xl py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono-label mb-1">participant workspace</div>
          <h1 className="text-3xl font-bold tracking-tight">{event?.title ?? "—"}</h1>
        </div>
        {deadline && (
          <div className="rounded-lg border border-border bg-card px-4 py-2.5 font-mono text-sm">
            <Clock size={14} className="mr-2 inline text-primary" />
            deadline: {deadline.toLocaleString()}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- team --- */}
      {!team ? (
        <div className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-1 flex items-center gap-2 font-semibold"><Users size={16} className="text-primary" /> Create a team</h2>
            <p className="mb-3 text-xs text-muted-foreground">You'll be the leader and get an invite code.</p>
            <CreateTeamForm onCreate={async (name) => { try { await createTeam({ eventId: event!._id, name }); toast.success("Team created"); } catch (e: any) { toast.error(e.message); } }} />
          </div>
          <div className="sm:border-l sm:border-border sm:pl-6">
            <h2 className="mb-1 flex items-center gap-2 font-semibold"><UserPlus size={16} className="text-primary" /> Join with invite code</h2>
            <p className="mb-3 text-xs text-muted-foreground">Got a code from a teammate? Enter it here.</p>
            <div className="flex gap-2">
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="invite code"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={async () => {
                  try { await joinTeam({ inviteCode }); toast.success("Joined team"); } catch (e: any) { toast.error(e.message); }
                }}
                className="rounded-md bg-primary px-4 py-2 font-mono text-xs font-semibold uppercase text-primary-foreground"
              >
                join
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mono-label mb-1">your team</div>
              <h2 className="text-xl font-bold">{team.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <code className="rounded bg-secondary px-3 py-1.5 font-mono text-sm">{team.inviteCode}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(team.inviteCode); toast("Invite code copied"); }}
                className="rounded-md border border-border p-2 transition hover:text-primary"
                title="Copy invite code"
              >
                <Copy size={14} />
              </button>
              <button
                onClick={async () => { try { await leaveTeam({ teamId: team._id }); toast("Left team"); } catch (e: any) { toast.error(e.message); } }}
                className="rounded-md border border-border p-2 transition hover:text-destructive"
                title="Leave team"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {team.members.map((m: any) => (
              <span key={m.userId} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs">
                <span className={`h-1.5 w-1.5 rounded-full ${m.memberRole === "leader" ? "bg-primary" : "bg-muted-foreground/40"}`} />
                {m.name} {m.memberRole === "leader" && <span className="mono-label">leader</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ submission --- */}
      {team && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <FileEdit size={17} className="text-primary" />
              {submission ? (submission.status === "submitted" ? "Submission (locked)" : "Submission draft") : "New submission"}
            </h2>
            {submission?.status === "submitted" && (
              <span className="rounded-full bg-success/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-success">
                submitted ✓
              </span>
            )}
          </div>

          {isLocked && (
            <div className="mb-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 font-mono text-xs text-accent-foreground">
              {submission?.status === "submitted"
                ? "This submission is locked. Withdraw it (before the deadline) to keep editing."
                : "The deadline has passed — submissions are locked."}
            </div>
          )}

          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="mono-label">project title *</span>
                <input disabled={isLocked} value={draft.title} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setDirty(true); }}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
              </label>
              <label className="grid gap-1">
                <span className="mono-label">tagline</span>
                <input disabled={isLocked} value={draft.tagline} onChange={(e) => { setDraft({ ...draft, tagline: e.target.value }); setDirty(true); }}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="mono-label">track</span>
              <select
                disabled={isLocked}
                value={draft.trackId}
                onChange={(e) => { setDraft({ ...draft, trackId: e.target.value }); setDirty(true); }}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— open track —</option>
                {(tracks ?? []).map((t) => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="mono-label">description (markdown) *</span>
              <textarea disabled={isLocked} rows={8} value={draft.description} onChange={(e) => { setDraft({ ...draft, description: e.target.value }); setDirty(true); }}
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                placeholder="## What it does&#10;…&#10;&#10;## Why it matters&#10;…" />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1">
                <span className="mono-label">repository url</span>
                <input disabled={isLocked} value={draft.repositoryUrl} onChange={(e) => { setDraft({ ...draft, repositoryUrl: e.target.value }); setDirty(true); }}
                  className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" placeholder="https://github.com/…" />
              </label>
              <label className="grid gap-1">
                <span className="mono-label">video url</span>
                <input disabled={isLocked} value={draft.videoUrl} onChange={(e) => { setDraft({ ...draft, videoUrl: e.target.value }); setDirty(true); }}
                  className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" placeholder="https://…" />
              </label>
              <label className="grid gap-1">
                <span className="mono-label">demo url</span>
                <input disabled={isLocked} value={draft.demoUrl} onChange={(e) => { setDraft({ ...draft, demoUrl: e.target.value }); setDirty(true); }}
                  className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" placeholder="https://…" />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="mono-label">tags (comma separated)</span>
              <input disabled={isLocked} value={draft.tags} onChange={(e) => { setDraft({ ...draft, tags: e.target.value }); setDirty(true); }}
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" placeholder="ai, devtools, offline" />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={doSave}
              disabled={isLocked || !dirty}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider transition hover:border-primary/50 disabled:opacity-40"
            >
              <Save size={14} /> {dirty ? "save draft" : "saved"}
            </button>
            {submission?.status !== "submitted" ? (
              <button
                onClick={async () => {
                  try { await doSave(); await submitProj({ eventId: event!._id }); toast.success("Submitted for judging!"); }
                  catch (e: any) { toast.error(e.message); }
                }}
                disabled={isLocked}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-40"
              >
                <Send size={14} /> submit for judging
              </button>
            ) : (
              <button
                onClick={async () => {
                  try { await withdrawProj({ eventId: event!._id }); toast("Withdrawn to draft"); }
                  catch (e: any) { toast.error(e.message); }
                }}
                className="flex items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-destructive transition hover:bg-destructive/10"
              >
                <Undo2 size={14} /> withdraw
              </button>
            )}
            <span className="font-mono text-[11px] text-muted-foreground">
              {dirty ? "unsaved changes — autosaving…" : "all changes saved"}
            </span>
          </div>
        </div>
      )}

      {/* my certificates */}
      <MyCerts />
    </div>
  );
}

function CreateTeamForm({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="team name"
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        onClick={async () => { if (name.trim()) await onCreate(name.trim()); }}
        className="rounded-md bg-primary px-4 py-2 font-mono text-xs font-semibold uppercase text-primary-foreground"
      >
        create
      </button>
    </div>
  );
}

function MyCerts() {
  const certs = useQuery(api.certificates.mine, {});
  if (!certs?.length) return null;
  return (
    <div className="mt-8">
      <div className="mono-label mb-3">my certificates</div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {certs.map((c: any) => (
          <div key={c._id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <Trophy size={18} className="text-primary" />
            <div className="flex-1">
              <div className="text-sm font-medium">{c.title}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{c.certUuid.slice(0, 12)}…</div>
            </div>
            <a href={`/verify/${c.certUuid}?signature=${c.signatureHash}`} className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline">
              verify
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
