"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EventDetail } from "@/components/EventDetail";

// The query-string route, kept as the fallback for entries recorded since
// the last build. Statically generated pages live at /event/<id> and are
// what the sitemap, the canonical tags and every crawler are pointed at.
function FromQuery() {
  const id = useSearchParams().get("id");
  return <EventDetail id={id} />;
}

export default function EventPage() {
  return (
    <Suspense fallback={<p className="mono dim">retrieving the record…</p>}>
      <FromQuery />
    </Suspense>
  );
}
