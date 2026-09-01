import type { Event } from "@agent-civilizations/schema";
import { CategoryLabel } from "./Glyph";
import { utcTime } from "@/lib/format";

// The register row. Confirmed is inked: filled glyph, solid rule.
// Candidate is penciled: hollow glyph, dashed rule, dim metadata — but the
// title stays at full ink; provisional is not disabled.
export function RegisterRow({ event }: { event: Event }) {
  const candidate = event.confidence === "candidate";
  return (
    <article className={`drow${candidate ? " candidate" : ""}`}>
      <div className="drail">
        <span>No. {event.seq}</span>
        <span>{utcTime(event.recordedAt)}</span>
      </div>
      <div className="dbody">
        <h3 className="dtitle">
          <a href={`/event?id=${encodeURIComponent(event.id)}`}>
            {event.title}
          </a>
        </h3>
        <p className="dsummary">{event.summary}</p>
        <div className="dmeta">
          <CategoryLabel category={event.category} filled={!candidate} />
          <span>
            {candidate
              ? "CANDIDATE □ — reported, not yet corroborated"
              : "CONFIRMED ■"}
          </span>
          <a
            href={`/civilization?id=${encodeURIComponent(event.civilizationId)}`}
          >
            → FILE {event.civilizationId.toUpperCase()}
          </a>
        </div>
      </div>
    </article>
  );
}
