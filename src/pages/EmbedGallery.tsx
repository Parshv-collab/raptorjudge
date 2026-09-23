import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Search, Terminal } from "lucide-react";

/** Lightweight, standalone gallery widget for embedding via iframe. */
export default function EmbedGallery() {
  const { slug } = useParams<{ slug: string }>();
  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const [search, setSearch] = useState("");
  const cards = useQuery(
    api.submissions.publicGallery,
    event ? { eventId: event._id, search: search || undefined } : "skip",
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-primary" />
          <span className="font-mono text-xs font-bold">{event?.title ?? "…"} · gallery</span>
        </div>
        <div className="relative w-48">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search…"
            className="w-full rounded border border-input bg-background py-1.5 pl-7 pr-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {(cards ?? []).map((c: any) => (
          <a
            key={c.id}
            href={`/project/${c.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border bg-card p-3 transition hover:border-primary/50"
          >
            <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-primary">{c.trackName}</div>
            <div className="text-sm font-semibold leading-tight">{c.title}</div>
            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.tagline}</div>
          </a>
        ))}
      </div>

      {(cards ?? []).length === 0 && (
        <div className="py-16 text-center font-mono text-xs text-muted-foreground">no public projects yet</div>
      )}

      <div className="mt-4 text-center font-mono text-[9px] text-muted-foreground">
        embedded widget · raptorjudge
      </div>
    </div>
  );
}
