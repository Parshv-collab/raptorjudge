import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { EventPicker } from "@/components/participant/EventPicker";
import { TeamChatSection } from "@/pages/ParticipantWorkspace";
import { usePrimaryEventSlug } from "@/lib/featuredEvent";

/**
 * `/workspace/chat` — pick a team you belong to and talk to it.
 *
 * Team chat is private to its members (enforced in `convex/teamChat.ts`, with no
 * staff back door), so this page only ever lists the caller's own teams.
 */
export default function TeamChat() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;
  const fallbackSlug = usePrimaryEventSlug();
  const navigate = useNavigate();

  // Issue 40: scope the chat list to the selected enrolled event.
  const [searchParams] = useSearchParams();
  const enrolled = useQuery(api.events.enrolled, skip ? "skip" : {});
  const selectedSlug = searchParams.get("event") ?? (enrolled?.[0]?.slug ?? null);
  const selectedEventId = useMemo(
    () => (enrolled ?? []).find((e: any) => e.slug === selectedSlug)?._id ?? null,
    [enrolled, selectedSlug],
  );

  const teams = useQuery(
    (api as any).teamChat.myTeamChat,
    skip ? "skip" : selectedEventId ? { eventId: selectedEventId } : {},
  );
  const [selected, setSelected] = useState<string | null>(null);

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  const list = (teams ?? []) as any[];
  const activeTeamId = selected ?? list[0]?.teamId ?? null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Team chat"
        description="Private to your team's members — organizers and judges cannot read it."
        actions={
          <Link
            to="/workspace"
            className="text-sm text-accent hover:text-accent-hover transition-colors duration-fast"
          >
            ← Back to workspace
          </Link>
        }
      />

      <EventPicker
        events={((enrolled ?? []) as any[]).map((e) => ({ slug: e.slug, title: e.title, status: e.status }))}
        value={selectedSlug}
      />

      {teams === undefined ? (
        <SkeletonCard lines={4} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No team chats yet"
          description="Join or create a team in an event workspace, and your private channel will appear here."
          actionLabel="Open workspace"
          onAction={() => navigate(`/workspace?event=${fallbackSlug}`)}
        />
      ) : (
        <>
          {list.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {list.map((t) => (
                <button
                  key={t.teamId}
                  type="button"
                  onClick={() => setSelected(t.teamId)}
                  aria-pressed={activeTeamId === t.teamId}
                  className={`h-8 px-3.5 rounded-pill text-[13px] font-medium border transition-colors duration-fast ${
                    activeTeamId === t.teamId
                      ? "bg-accent/10 text-accent border-accent/40"
                      : "bg-surface-1 text-secondary border-line hover:text-primary hover:border-line-strong"
                  }`}
                >
                  {t.teamName}
                  <span className="ml-1.5 opacity-70 tnum">({t.messageCount})</span>
                </button>
              ))}
            </div>
          )}

          {activeTeamId && <TeamChatSection teamId={activeTeamId} />}
        </>
      )}
    </div>
  );
}
