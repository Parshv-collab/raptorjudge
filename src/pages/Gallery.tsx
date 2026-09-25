import React, { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
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
      list = [...list].sort((a, b) => b.title.localeCompare(a.title));
    }
    return list;
  }, [cards, selectedTrack, sortBy]);

  const galleryClosed = event && ["draft", "registration", "hacking"].includes(event.status);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-8">
      {/* Gallery Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1d1d1f]">
            {event?.title ? `${event.title} Projects` : "Project Gallery"}
          </h1>
          <p className="text-xs text-[#6e6e73] mt-1">
            {galleryClosed
              ? "Gallery submissions will be visible once hacking concludes."
              : `Browsing ${visibleProjects.length} project submissions`}
          </p>
        </div>

        <Link to={`/e/${slug || DEFAULT_EVENT_SLUG}`}>
          <span className="text-xs font-semibold text-[#ff0055] hover:underline">
            ← Back to Event
          </span>
        </Link>
      </div>

      {/* Filter Controls Bar */}
      <GlassCard className="p-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="w-full sm:flex-1">
          <Input
            placeholder="Search project title, tagline, team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="w-full sm:w-48">
          <Dropdown
            options={[
              { value: "", label: "All Tracks" },
              ...(tracks || []).map((t) => ({ value: t.name, label: t.name })),
            ]}
            value={selectedTrack}
            onChange={(val) => setSelectedTrack(val)}
          />
        </div>

        <div className="w-full sm:w-48">
          <Dropdown
            options={SORT_OPTIONS}
            value={sortBy}
            onChange={(val) => setSortBy(val)}
          />
        </div>
      </GlassCard>

      {/* Gallery Cards Grid (3 per row desktop, 2 tablet, 1 mobile) */}
      {cards === undefined ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <SkeletonCard lines={3} /><SkeletonCard lines={3} /><SkeletonCard lines={3} />
        </div>
      ) : galleryClosed ? (
        <EmptyState
          title="Gallery Embargoed"
          description="Submissions for this event will be published after the submission deadline."
        />
      ) : visibleProjects.length === 0 ? (
        <EmptyState
          title="No Projects Found"
          description="No submitted projects match your current filter or search query."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleProjects.map((project: any) => (
            <Link key={project.id} to={`/project/${project.id}`}>
              <GlassCard
                hoverEffect
                className="h-full flex flex-col justify-between p-5 border-white/80"
              >
                <div>
                  {/* Cover Image Placeholder */}
                  <div className="w-full h-36 rounded-input bg-gradient-to-br from-[#ff0055]/10 via-purple-500/10 to-blue-500/10 border border-white/80 flex items-center justify-center text-[#ff0055] mb-4 font-bold text-lg">
                    {project.title.substring(0, 2).toUpperCase()}
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
                      {project.trackName || "General Track"}
                    </span>
                    <span className="text-[11px] font-semibold text-[#6e6e73]">
                      {project.teamName}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-[#1d1d1f] mb-1 line-clamp-1">
                    {project.title}
                  </h3>

                  <p className="text-xs text-[#6e6e73] line-clamp-2 leading-relaxed">
                    {project.tagline || project.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-black/5 flex justify-between items-center text-[11px] font-semibold text-[#ff0055]">
                  <span>View Details →</span>
                  {project.tags && (
                    <span className="text-[#6e6e73] font-normal truncate max-w-[150px]">
                      {project.tags}
                    </span>
                  )}
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
