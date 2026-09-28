import { useLocation, useNavigate } from "react-router-dom";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

export interface EventPickerEvent {
  slug: string;
  title: string;
  status?: string;
}

export interface EventPickerProps {
  /** Events the participant can switch between (their enrollments). */
  events: EventPickerEvent[];
  /** The currently selected event slug, or null when nothing is selected. */
  value: string | null;
  /**
   * "query" (default) keeps the current sub-page and sets `?event=<slug>`;
   * "path" navigates to `${basePath}/<slug>` (used by the `/results/:slug`
   * route, which carries the event in the path rather than the query).
   */
  variant?: "query" | "path";
  basePath?: string;
  className?: string;
}

/**
 * Participant event selector (issue 40).
 *
 * "My Team", "Chat" and "Results" previously had no idea which event they were
 * about: reaching them meant Dashboard → event → workspace → sub-page. This
 * picker puts the event choice at the top of each of those pages, defaults to
 * the participant's most recent enrollment, and records the choice in the URL
 * (`?event=<slug>`, or `/results/<slug>`) so the selection is shareable and
 * survives a reload.
 */
export function EventPicker({
  events,
  value,
  variant = "query",
  basePath = "/results",
  className = "",
}: EventPickerProps) {
  const navigate = useNavigate();
  const location = useLocation();

  if (events.length === 0) return null;

  function handleChange(slug: string) {
    if (variant === "path") {
      navigate(`${basePath}/${slug}`);
      return;
    }
    const params = new URLSearchParams(location.search);
    params.set("event", slug);
    navigate(`${location.pathname}?${params.toString()}`);
  }

  const options = events.map((event) => ({
    value: event.slug,
    label: event.title,
  }));

  return (
    <div className={`flex flex-col sm:flex-row sm:items-end gap-3 ${className}`}>
      <div className="w-full sm:w-72">
        <Dropdown
          label="Event"
          options={options}
          value={value ?? ""}
          onChange={handleChange}
          disabled={events.length < 2}
        />
      </div>
      {value && (
        <Badge variant="accent" className="mb-2.5">
          {events.find((e) => e.slug === value)?.status ?? "enrolled"}
        </Badge>
      )}
    </div>
  );
}

export default EventPicker;
