import React, { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePrimaryEvent } from "@/lib/featuredEvent";

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get("q") || "";
  const [queryInput, setQueryInput] = useState(queryParam);
  const [activeTab, setActiveTab] = useState("all");

  const events = useQuery(api.events.listPublic, {});
  const { event } = usePrimaryEvent();
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

  // All three sources are still resolving. Without this the page computed
  // `totalResults === 0` on the very first paint and greeted the visitor with
  // `No results for ""` before it had searched for anything.
  const sourcesLoading =
    events === undefined ||
    (event ? gallery === undefined || teams === undefined : false);

  const tabItems = [
    { id: "all", label: "All results", badge: totalResults },
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
    <div className="flex flex-col gap-8">
      <PageHeader
        title={queryParam ? `Results for "${queryParam}"` : "Search"}
        description="Events, projects and teams across the platform."
        bordered={false}
      />

      <form onSubmit={handleSearchSubmit} className="flex gap-3 max-w-2xl">
        <Input
          aria-label="Search query"
          placeholder="Search events, projects, teams..."
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
        />
        <button
          type="submit"
          className="h-10 px-5 rounded-btn bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors duration-fast shrink-0"
        >
          Search
        </button>
      </form>

      <Tabs tabs={tabItems} activeTab={activeTab} onChange={(id) => setActiveTab(id)} />

      {sourcesLoading && queryParam.trim() ? (
        <div className="flex flex-col gap-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : totalResults === 0 ? (
        <EmptyState
          title={queryParam.trim() ? `No results for "${queryParam.trim()}"` : "Search RaptorJudge"}
          description={
            queryParam.trim()
              ? "Try searching with different keywords or check the spelling. Projects are matched on their title and tagline, teams on their name."
              : "Type a project name, an event host or a team name above. Results are grouped into Events, Projects and Teams."
          }
        />
      ) : (
        <div className="flex flex-col gap-12">
          {(activeTab === "all" || activeTab === "events") && matchedEvents.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-h3 text-primary">Events ({matchedEvents.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {matchedEvents.map((e: any) => (
                  <Link
                    key={e._id}
                    to={`/e/${e.slug}`}
                    className="bg-surface-1 border border-line rounded-card p-5 flex flex-col justify-between transition-colors duration-fast hover:border-line-strong"
                  >
                    <div>
                      <Badge variant="default" className="mb-2">{e.status}</Badge>
                      <h3 className="text-[15px] font-semibold text-primary">{e.title}</h3>
                      <p className="text-[13px] text-secondary mt-1 line-clamp-2">{e.tagline || e.description}</p>
                    </div>
                    <span className="mt-4 pt-3 border-t border-line text-[13px] font-medium text-accent">
                      View event →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {(activeTab === "all" || activeTab === "projects") && matchedProjects.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-h3 text-primary">Projects ({matchedProjects.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {matchedProjects.map((p: any) => (
                  <Link
                    key={p.id}
                    to={`/project/${p.id}`}
                    className="bg-surface-1 border border-line rounded-card p-5 flex flex-col justify-between transition-colors duration-fast hover:border-line-strong"
                  >
                    <div>
                      <Badge variant="accent" className="mb-2">{p.trackName}</Badge>
                      <h3 className="text-[15px] font-semibold text-primary">{p.title}</h3>
                      <p className="text-[13px] text-secondary mt-1 line-clamp-2">{p.tagline}</p>
                    </div>
                    <span className="mt-4 pt-3 border-t border-line text-[13px] font-medium text-accent">
                      View project →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {(activeTab === "all" || activeTab === "teams") && matchedTeams.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-h3 text-primary">Teams ({matchedTeams.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {matchedTeams.map((t: any) => (
                  <div key={t._id} className="bg-surface-1 border border-line rounded-card p-5">
                    <span className="text-[11px] uppercase tracking-[0.05em] text-muted">Team</span>
                    <h3 className="text-[15px] font-semibold text-primary mt-1">{t.name}</h3>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
