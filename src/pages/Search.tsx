import React, { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get("q") || "";
  const [queryInput, setQueryInput] = useState(queryParam);
  const [activeTab, setActiveTab] = useState("all");

  const events = useQuery(api.events.listPublic, {});
  const event = useQuery(api.events.getBySlug, { slug: "dogfood-2026" });
  const gallery = useQuery(
    api.submissions.publicGallery,
    event ? { eventId: event._id, search: queryParam || undefined } : "skip"
  );
  const teams = useQuery(
    api.teams.listByEvent,
    event ? { eventId: event._id } : "skip"
  );

  const matchedEvents = useMemo(() => {
    if (!queryParam.trim() || !events) return [];
    const q = queryParam.toLowerCase();
    return events.filter(
      (e: any) =>
        e.title?.toLowerCase().includes(q) ||
        e.hostName?.toLowerCase().includes(q) ||
        e.tagline?.toLowerCase().includes(q)
    );
  }, [events, queryParam]);

  const matchedProjects = useMemo(() => {
    if (!queryParam.trim() || !gallery) return [];
    return gallery;
  }, [gallery, queryParam]);

  const matchedTeams = useMemo(() => {
    if (!queryParam.trim() || !teams) return [];
    const q = queryParam.toLowerCase();
    return teams.filter(
      (t: any) =>
        t.name?.toLowerCase().includes(q) ||
        t.inviteCode?.toLowerCase().includes(q)
    );
  }, [teams, queryParam]);

  const totalResults = matchedEvents.length + matchedProjects.length + matchedTeams.length;

  const tabItems = [
    { id: "all", label: "All Results", badge: totalResults },
    { id: "events", label: "Events", badge: matchedEvents.length },
    { id: "projects", label: "Projects", badge: matchedProjects.length },
    { id: "teams", label: "Teams", badge: matchedTeams.length },
  ];

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (queryInput.trim()) {
      setSearchParams({ q: queryInput.trim() });
    }
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-8">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
          Search Results
        </span>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
          {queryParam ? `Results for "${queryParam}"` : "Search Platform"}
        </h1>
      </div>

      <GlassCard className="p-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-3">
          <Input
            placeholder="Search events, projects, teams..."
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-[#ff0055] text-white font-bold text-xs rounded-button shadow-sm hover:bg-[#e0004b] shrink-0"
          >
            Search
          </button>
        </form>
      </GlassCard>

      <Tabs tabs={tabItems} activeTab={activeTab} onChange={(id) => setActiveTab(id)} />

      {totalResults === 0 ? (
        <EmptyState
          title={`No results for '${queryParam}'`}
          description="Try searching with different keywords or check spelling."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {(activeTab === "all" || activeTab === "events") && matchedEvents.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-base font-bold text-[#1d1d1f]">Events ({matchedEvents.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {matchedEvents.map((e: any) => (
                  <GlassCard key={e._id} hoverEffect className="p-5 flex flex-col justify-between">
                    <div>
                      <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-full bg-[#ff0055]/10 text-[#ff0055] mb-2 inline-block">
                        {e.status}
                      </span>
                      <h3 className="text-base font-bold text-[#1d1d1f]">{e.title}</h3>
                      <p className="text-xs text-[#6e6e73] mt-1 line-clamp-2">{e.tagline || e.description}</p>
                    </div>
                    <Link to={`/e/${e.slug}`} className="mt-4 pt-2 border-t border-black/5">
                      <span className="text-xs font-bold text-[#ff0055] hover:underline">
                        View Event →
                      </span>
                    </Link>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {(activeTab === "all" || activeTab === "projects") && matchedProjects.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-base font-bold text-[#1d1d1f]">Projects ({matchedProjects.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {matchedProjects.map((p: any) => (
                  <GlassCard key={p.id} hoverEffect className="p-5 flex flex-col justify-between">
                    <div>
                      <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-full bg-blue-500/10 text-blue-600 mb-2 inline-block">
                        {p.trackName}
                      </span>
                      <h3 className="text-base font-bold text-[#1d1d1f]">{p.title}</h3>
                      <p className="text-xs text-[#6e6e73] mt-1 line-clamp-2">{p.tagline}</p>
                    </div>
                    <Link to={`/project/${p.id}`} className="mt-4 pt-2 border-t border-black/5">
                      <span className="text-xs font-bold text-[#ff0055] hover:underline">
                        View Project →
                      </span>
                    </Link>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {(activeTab === "all" || activeTab === "teams") && matchedTeams.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-base font-bold text-[#1d1d1f]">Teams ({matchedTeams.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {matchedTeams.map((t: any) => (
                  <GlassCard key={t._id} className="p-5">
                    <span className="text-[10px] font-bold text-[#6e6e73]">Team</span>
                    <h3 className="text-base font-bold text-[#1d1d1f] mt-1">{t.name}</h3>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
