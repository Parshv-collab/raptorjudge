import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { DEFAULT_EVENT_SLUG } from "@/lib/featuredEvent";

/** Standalone embeddable gallery: no app chrome, dark canvas. */
export default function EmbedGallery() {
  const { slug } = useParams<{ slug: string }>();
  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const [search, setSearch] = useState("");

  const cards = useQuery(
    api.submissions.publicGallery,
    event ? { eventId: event._id, search: search || undefined } : "skip"
  );

  return (
    <div className="min-h-screen p-4 bg-canvas text-primary">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-btn bg-accent text-white font-bold text-[11px] flex items-center justify-center shrink-0">
              R
            </span>
            <span className="text-[13px] font-semibold truncate">
              {event?.title || "RaptorJudge"} gallery
            </span>
          </div>
          <div className="w-44 shrink-0">
            <Input aria-label="Search projects" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <details className="text-[11px] text-muted bg-surface-1 border border-line rounded-card p-2.5">
          <summary className="cursor-pointer font-medium hover:text-secondary">Get embed code</summary>
          <code className="block mt-1.5 font-mono text-[11px] select-all bg-surface-2 p-2 rounded-btn overflow-x-auto">
            {`<iframe src="${window.location.origin}/embed/gallery/${slug || DEFAULT_EVENT_SLUG}" width="100%" height="600" frameborder="0"></iframe>`}
          </code>
        </details>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(cards || []).map((card: any) => (
          <a
            key={card.id}
            href={`/project/${card.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-surface-1 border border-line rounded-card p-4 transition-colors duration-fast hover:border-line-strong"
          >
            <Badge variant="accent">{card.trackName}</Badge>
            <h4 className="text-[13px] font-semibold mt-2 line-clamp-1">{card.title}</h4>
            <p className="text-[13px] text-secondary mt-1 line-clamp-2">{card.tagline}</p>
          </a>
        ))}
      </div>

      {(!cards || cards.length === 0) && (
        <div className="py-12 text-center text-[13px] text-muted">No public projects found</div>
      )}
    </div>
  );
}
