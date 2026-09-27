import { useCallback, useEffect, useRef, useState } from "react";

interface Slide {
  quote: string;
  points: string[];
}

/**
 * Five statements that describe what the platform actually guarantees.
 * The label above the quote is constant across slides, so the panel reads as
 * one continuous manifesto rather than five unrelated ads.
 */
export const HERO_SLIDES: Slide[] = [
  {
    quote: "A harsh panel and a generous panel should produce the same ranking.",
    points: [
      "Per-judge z-score normalisation on a 0–10 scale.",
      "Raw averages stay visible next to the normalised score.",
      "The compression is proven in normalization-proof.txt.",
      "Nobody's 6 is compared to anybody else's 9.",
    ],
  },
  {
    quote: "Hide a button and you have hidden nothing. Refuse the request and you have.",
    points: [
      "Every privileged read is re-checked on the server.",
      "Judges cannot read a peer's scores, even with the URL.",
      "Participants cannot reach the scoring API at all.",
      "The acceptance suite probes the same URLs the UI calls.",
    ],
  },
  {
    quote: "One command, no cloud, no accounts.",
    points: [
      "docker compose up builds Postgres, Convex, nginx and the SPA.",
      "No external API keys, no telemetry, no outbound calls.",
      "Deterministic fixture seed on first boot.",
      "Runs on a laptop, a LAN box, or a private VM.",
    ],
  },
  {
    quote: "Depth, not decoration.",
    points: [
      "Weighted rubrics that lock when judging starts.",
      "Bradley–Terry pairwise ranking, separate from raw averages.",
      "Per-judge load caps and conflict-aware assignment.",
      "CSV and JSON export for every result set.",
    ],
  },
  {
    quote: "Votes, comments, and chat — all gated, all logged.",
    points: [
      "Plain and quadratic community voting with hidden tallies.",
      "Comment moderation with flag, dismiss and delete.",
      "Team chat restricted to team members.",
      "A hash-chained audit entry behind every privileged write.",
    ],
  },
];

export interface HeroCarouselProps {
  /** Rotation period in milliseconds. */
  intervalMs?: number;
  className?: string;
}

/** True when the visitor asked the OS to reduce motion. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** True while the tab is visible (rotation pauses in background tabs). */
function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setVisible(document.visibilityState !== "hidden");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}

/**
 * Rotating hero panel for /auth.
 *
 * Motion is plain CSS (no animation dependency): a two-phase fade where the
 * outgoing slide drops 8px over 250ms and the incoming slide rises into place
 * over 400ms. Rotation pauses on hover and when the tab is hidden, and is
 * disabled entirely under `prefers-reduced-motion` — in that mode every slide
 * is still reachable by clicking a dot.
 */
export function HeroCarousel({ intervalMs = 6000, className = "" }: HeroCarouselProps) {
  const slides = HERO_SLIDES;
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [hovered, setHovered] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const documentVisible = useDocumentVisible();
  const outTimer = useRef<number | null>(null);

  const clearOutTimer = useCallback(() => {
    if (outTimer.current !== null) {
      window.clearTimeout(outTimer.current);
      outTimer.current = null;
    }
  }, []);

  /** Fade the current slide out, swap it, then fade the next one in. */
  const goTo = useCallback(
    (next: number) => {
      const target = ((next % slides.length) + slides.length) % slides.length;
      if (target === index) return;

      if (reducedMotion) {
        setIndex(target);
        setPhase("in");
        return;
      }

      clearOutTimer();
      setPhase("out");
      outTimer.current = window.setTimeout(() => {
        setIndex(target);
        setPhase("in");
        outTimer.current = null;
      }, 250);
    },
    [clearOutTimer, index, reducedMotion, slides.length],
  );

  // Rotation. Every dependency that should "reset the clock" is listed, so
  // hovering, tab-hiding or a manual dot click restarts the full interval.
  useEffect(() => {
    if (reducedMotion || hovered || !documentVisible) return;
    const timer = window.setTimeout(() => goTo(index + 1), intervalMs);
    return () => window.clearTimeout(timer);
  }, [documentVisible, goTo, hovered, index, intervalMs, reducedMotion]);

  useEffect(() => clearOutTimer, [clearOutTimer]);

  const slide = slides[index];
  const transitionStyle = reducedMotion
    ? undefined
    : {
        transitionProperty: "opacity, transform",
        transitionDuration: phase === "in" ? "400ms" : "250ms",
        transitionTimingFunction: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      };

  return (
    <div
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div
        aria-live="polite"
        aria-atomic="true"
        className={`flex flex-col gap-8 transition-opacity ${
          reducedMotion ? "" : phase === "out" ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
        }`}
        style={transitionStyle}
      >
        <p className="font-mono text-[13px] text-muted">RaptorJudge / DOGFOOD 2026</p>

        <blockquote className="text-h2 text-primary leading-snug min-h-[7rem]">
          &ldquo;{slide.quote}&rdquo;
        </blockquote>

        <div className="flex flex-col gap-4 text-sm text-secondary">
          {slide.points.map((point, i) => (
            <div className="flex gap-3" key={point}>
              <span className="font-mono text-accent text-[13px] shrink-0 w-8">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{point}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5 mt-10" role="tablist" aria-label="Hero slides">
        {slides.map((s, i) => (
          <button
            key={s.quote}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Show slide ${i + 1} of ${slides.length}`}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-pill transition-colors duration-fast ${
              i === index ? "w-7 bg-accent" : "w-4 bg-line-strong hover:bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
