import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";

export default function EmbedGallery() {
  const { slug } = useParams<{ slug: string }>();
  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const [search, setSearch] = useState("");

  const cards = useQuery(
    api.submissions.publicGallery,
    event ? { eventId: event._id, search: search || undefined } : "skip"
  );

  return (
    <div className="min-h-screen p-4 bg-[#f5f5f7]">
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#ff0055] text-white font-black text-xs flex items-center justify-center">
              R
            </div>
            <span className="text-xs font-bold text-[#1d1d1f]">
              {event?.title || "RaptorJudge"} Gallery
            </span>
          </div>

          <div className="w-48">
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Snippet display for organizers */}
        <details className="text-[10px] text-[#6e6e73] bg-white/60 p-2 rounded border border-white">
          <summary className="cursor-pointer font-semibold hover:text-[#1d1d1f]">Get Embed Code</summary>
          <code className="block mt-1 font-mono text-[10px] select-all bg-black/5 p-1 rounded">
            {`<iframe src="${window.location.origin}/embed/gallery/${slug || "dogfood-2026"}" width="100%" height="600" frameborder="0"></iframe>`}
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
          >
            <GlassCard hoverEffect className="p-3.5 border-white/80">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#ff0055]">
                {card.trackName}
              </span>
              <h4 className="text-xs font-bold text-[#1d1d1f] mt-0.5 line-clamp-1">{card.title}</h4>
              <p className="text-[11px] text-[#6e6e73] mt-1 line-clamp-2">{card.tagline}</p>
            </GlassCard>
          </a>
        ))}
      </div>

      {(!cards || cards.length === 0) && (
        <div className="py-12 text-center text-xs text-[#6e6e73]">
          No public projects found
        </div>
      )}
    </div>
  );
}
