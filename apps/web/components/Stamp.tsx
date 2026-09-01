import type { CivilizationStatus } from "@agent-civilizations/schema";
import { utcDay } from "@/lib/format";

// Status is a stamp, not a badge. ACTIVE is solid caps inside a rule;
// DORMANT is the same stamp gone hollow and dashed; EXTINCT closes the
// file with a heavy rule and the closing date — the register ruled off.
export function Stamp({
  status,
  closedAt,
}: {
  status: CivilizationStatus;
  closedAt?: string;
}) {
  return (
    <span className={`stamp ${status}`}>
      {status.toUpperCase()}
      {status === "extinct" && closedAt && (
        <small>FILE CLOSED {utcDay(closedAt)}</small>
      )}
    </span>
  );
}
