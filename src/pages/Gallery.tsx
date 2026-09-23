import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useState, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Search, Shuffle, Github, Video } from "lucide-react";

export default function Gallery() {
  const { slug } = useParams<{ slug: string }>();
  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const [search, setSearch] = useState("");
  const [track, setTrack] = useState<string>("");
  const [randomize, setRandomize] = useState(false);
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 30));

  const cards = useQuery(
    api.submissions.publicGallery,
    event
      ? {
          eventId: event._id,
          search: search || undefined,
          randomize,
          seed: randomize ? seed : undefined,
        }
      : "skip",
  );

  const tracks = useQuery(api.tracks.listByEvent, event ? { eventId: event._id } : "skip");

  const trackNames = useMemo(() => [...new Set((cards ?? []).map((c: any) => c.trackName))], [cards]);
  const visible = useMemo(
    () => (track ? (cards ?? []).filter((c: any) => c.trackName === track) : cards ?? []),
    [cards, track],
  );

  const galleryClosed = event && ["draft", "registration", "hacking"].includes(event.status);

  return (
    <div className="container py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono-label mb-1">public gallery</div>
          <h1 className="text-3xl font-bold tracking-tight">{event?.title ?? "…"} projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {galleryClosed
              ? "Projects become public once the hacking window closes."
              : `${visible.length} submitted project${visible.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5">
          <Shuffle size={15} className={randomize ? "text-primary" : "text-muted-foreground"} />
          <span className="font-mono text-xs uppercase tracking-wider">randomize order</span>
          <input
            type="checkbox"
            checked={randomize}
            onChange={(e) => setRandomize(e.target.checked)}
            className="ml-1 h-4 w-4 accent-[hsl(var(--primary))]"
          />
        </label>
      </div>

      {/* filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search title, tagline, tags, team…"
            className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTrack("")}
            className={`rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider transition ${
              track === "" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            all
          </button>
          {(tracks ?? []).map((t) => (
            <button
              key={t._id}
              onClick={() => setTrack(t.name)}
              className={`rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider transition ${
                track === t.name ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      {galleryClosed ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 py-24 text-center">
          <p className="font-mono text-sm text-muted-foreground">
            submissions are under embargo until the hacking window closes
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 py-24 text-center">
          <p className="font-mono text-sm text-muted-foreground">no projects match your search</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c: any) => (
            <a
              key={c.id}
              href={`/project/${c.id}`}
              className="card-hover group flex flex-col rounded-xl border border-border bg-card p-5"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-primary">
                  {c.trackName}
                </span>
                <div className="flex gap-2 text-muted-foreground">
                  {c.repositoryUrl && <Github size={15} />}
                  {c.videoUrl && <Video size={15} />}
                </div>
              </div>
              <h3 className="mb-1 text-lg font-semibold group-hover:text-primary">{c.title}</h3>
              <p className="mb-4 flex-1 text-sm text-muted-foreground">{c.tagline}</p>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">{c.teamName}</span>
                <div className="flex flex-wrap gap-1">
                  {c.tags
                    .split(",")
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((tag: string) => (
                      <span key={tag} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
