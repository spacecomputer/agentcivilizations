import type { Event } from "@agent-civilizations/schema";
import { CategoryLabel } from "./Glyph";
import { utcTime } from "@/lib/format";

// The rail marker: an 8px square in the category ink — filled when the
// entry is confirmed (inked), hollow when it is a candidate (penciled).
function RailMarker({ event }: { event: Event }) {
  const filled = event.confidence === "confirmed";
  return (
    <span
      className="rail-marker"
      style={{
        background: filled ? `var(--cat-${event.category})` : "transparent",
        borderColor: `var(--cat-${event.category})`,
      }}
      aria-hidden="true"
    />
  );
}

// The register row. Confirmed is inked: filled marker, solid rule.
// Candidate is penciled: hollow marker, dashed rule, dim metadata — but
// the title and summary stay at full ink; provisional is not disabled.
// filteredOut restyles the whole row to the dim token (never opacity).
export function RegisterRow({
  event,
  filteredOut = false,
}: {
  event: Event;
  filteredOut?: boolean;
}) {
  const candidate = event.confidence === "candidate";
  return (
    <article
      className={`drow${candidate ? " candidate" : ""}${filteredOut ? " filtered" : ""}`}
    >
      <div className="drail">
        <span>
          <RailMarker event={event} /> No. {event.seq}
        </span>
        <span>{utcTime(event.recordedAt)}</span>
      </div>
      <div className="dbody">
        <h3 className="dtitle">
          <a href={`/event/${encodeURIComponent(event.id)}`}>
            {event.title}
          </a>
        </h3>
        <p className="dsummary">{event.summary}</p>
        <div className="dmeta">
          <CategoryLabel category={event.category} filled={!candidate} />
          <span>
            {candidate
              ? "CANDIDATE — reported, not yet corroborated"
              : "CONFIRMED"}
          </span>
          <a
            href={`/civilization/${encodeURIComponent(event.civilizationId)}`}
          >
            → FILE {event.civilizationId.toUpperCase()}
          </a>
        </div>
      </div>
    </article>
  );
}
