import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { DEFAULT_EVENT_SLUG } from "@/lib/featuredEvent";

const SORT_OPTIONS = [
  { value: "default", label: "Default Order" },
  { value: "title_asc", label: "Title (A-Z)" },
  { value: "title_desc", label: "Title (Z-A)" },
];

export default function Gallery() {
  const { slug } = useParams<{ slug: string }>();
  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");

  const [search, setSearch] = useState("");
  const [selectedTrack, setSelectedTrack] = useState("");
  const [sortBy, setSortBy] = useState("default");

  const cards = useQuery(
    api.submissions.publicGallery,
    event ? { eventId: event._id, search: search || undefined } : "skip"
  );

  const tracks = useQuery(api.tracks.listByEvent, event ? { eventId: event._id } : "skip");

  const visibleProjects = useMemo(() => {
    let list = cards ?? [];
    if (selectedTrack) {
      list = list.filter((p: any) => p.trackName === selectedTrack);
    }
    if (sortBy === "title_asc") {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "title_desc") {
      list = [...list].sort((b, a) => a.title.localeCompare(b.title));
    }
    return list;
  }, [cards, selectedTrack, sortBy]);

  const galleryClosed = event && ["draft", "registration", "hacking"].includes(event.status);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={event?.title ? `${event.title} — projects` : "Project gallery"}
        description={
          galleryClosed
            ? "Gallery submissions will be visible once hacking concludes."
            : `Browsing ${visibleProjects.length} project submission${visibleProjects.length === 1 ? "" : "s"}`
        }
        actions={
          <Link
            to={`/e/${slug || DEFAULT_EVENT_SLUG}`}
            className="text-sm text-accent hover:text-accent-hover transition-colors duration-fast"
          >
            ← Back to event
          </Link>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-col gap-4">
        <div className="bg-surface-1 border border-line rounded-card p-4 flex flex-col sm:flex-row gap-4 items-center">
          <div className="w-full sm:flex-1">
            <Input
              aria-label="Search projects"
              placeholder="Search project title, tagline, team..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Dropdown options={SORT_OPTIONS} value={sortBy} onChange={(val) => setSortBy(val)} />
          </div>
        </div>

        {/* Track filter chips */}
        {tracks && tracks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedTrack("")}
              className={`h-8 px-3.5 rounded-pill text-[13px] font-medium border transition-colors duration-fast ${
                selectedTrack === ""
                  ? "bg-accent/10 text-accent border-accent/40"
                  : "bg-surface-1 text-secondary border-line hover:text-primary hover:border-line-strong"
              }`}
            >
              All tracks
            </button>
            {tracks.map((t) => (
              <button
                key={t._id}
                type="button"
                onClick={() => setSelectedTrack(t.name)}
                className={`h-8 px-3.5 rounded-pill text-[13px] font-medium border transition-colors duration-fast ${
                  selectedTrack === t.name
                    ? "bg-accent/10 text-accent border-accent/40"
                    : "bg-surface-1 text-secondary border-line hover:text-primary hover:border-line-strong"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cards grid */}
      {cards === undefined ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : galleryClosed ? (
        <EmptyState
          title="Gallery embargoed"
          description="Submissions for this event will be published after the submission deadline."
        />
      ) : visibleProjects.length === 0 ? (
        <EmptyState
          title="No projects found"
          description="No submitted projects match your current filter or search query."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleProjects.map((project: any) => (
            <Link key={project.id} to={`/project/${project.id}`} className="group">
              <div className="h-full bg-surface-1 border border-line rounded-card overflow-hidden transition-colors duration-fast group-hover:border-line-strong flex flex-col">
                <div className="h-32 bg-surface-2 border-b border-line flex items-center justify-center font-mono text-xl text-accent">
                  {project.title.substring(0, 2).toUpperCase()}
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Badge variant="accent">{project.trackName || "General Track"}</Badge>
                    <span className="text-[13px] text-muted truncate">{project.teamName}</span>
                  </div>

                  <h3 className="text-[15px] font-semibold text-primary">{project.title}</h3>
                  <p className="text-[13px] text-secondary line-clamp-2 leading-relaxed mt-1">
                    {project.tagline || project.description}
                  </p>

                  <div className="mt-auto pt-4 border-t border-line flex justify-between items-center text-[13px]">
                    <span className="font-medium text-accent">View details →</span>
                    {project.tags && (
                      <span className="text-muted truncate max-w-[150px] font-mono text-[11px]">{project.tags}</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
