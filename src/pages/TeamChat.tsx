import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
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

  const teams = useQuery((api as any).teamChat.myTeamChat, skip ? "skip" : {});
  const [selected, setSelected] = useState<string | null>(null);

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  const list = (teams ?? []) as any[];
  const activeTeamId = selected ?? list[0]?.teamId ?? null;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            Workspace
          </span>
          <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">Team chat</h1>
          <p className="text-xs text-[#6e6e73] mt-1">
            Private to your team&apos;s members — organizers and judges cannot read it.
          </p>
        </div>
        <Link to="/workspace">
          <span className="text-xs font-semibold text-[#ff0055] hover:underline focus-ring-accent rounded px-1">
            ← Back to workspace
          </span>
        </Link>
      </div>

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
            <GlassCard className="p-3 flex flex-wrap gap-2">
              {list.map((t) => (
                <button
                  key={t.teamId}
                  type="button"
                  onClick={() => setSelected(t.teamId)}
                  aria-pressed={activeTeamId === t.teamId}
                  className={`px-3 py-1.5 rounded-button text-xs font-semibold border transition-colors focus-ring-accent ${
                    activeTeamId === t.teamId
                      ? "bg-[#ff0055] text-white border-[#ff0055]"
                      : "bg-white/60 text-[#1d1d1f] border-white/80 hover:bg-white/90"
                  }`}
                >
                  {t.teamName}
                  <span className="ml-1.5 opacity-70">({t.messageCount})</span>
                </button>
              ))}
            </GlassCard>
          )}

          {activeTeamId && <TeamChatSection teamId={activeTeamId} />}
        </>
      )}
    </div>
  );
}
