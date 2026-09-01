import type { Root } from "@agent-civilizations/schema";
import { SealMark } from "./marks";
import { chunkHash } from "@/lib/format";

// The daily root — the chancellor's seal. Bronze, on the raised surface,
// closing the day beneath it.
export function RootRow({ root }: { root: Root }) {
  return (
    <div className="droot">
      <div className="drail">SEALED</div>
      <div className="dbody">
        <div className="seal-line">
          <SealMark />
          Root record — {root.id} · {root.eventCount}{" "}
          {root.eventCount === 1 ? "event" : "events"} sealed
        </div>
        <div className="root-hash">
          merkleRoot {chunkHash(root.merkleRoot).join(" ")}
        </div>
      </div>
    </div>
  );
}

export function OpenDayRow({ day }: { day: string }) {
  return (
    <div className="droot open-day">
      <div className="drail">OPEN</div>
      <div className="dbody">
        <div className="seal-line dim">
          Day {day} — this day is open. Its root has not been sealed.
        </div>
      </div>
    </div>
  );
}
