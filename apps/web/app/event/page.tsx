"use client";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { EventDetail } from "@/components/EventDetail";

// The fall-through route for entries recorded since the last build.
//
// Statically generated pages live at /event/<id> and are what the sitemap,
// the canonical tags, every internal link and every crawler are pointed at.
// But the register mines every thirty minutes and rebuilds once a night, so
// between those two clocks an entry exists in Firestore with no page of its
// own. firebase.json rewrites /event/** here for exactly those ids — static
// files win over rewrites, so the 748 built pages are untouched — and this
// component reads the id back out of the path and fetches it live.
//
// The ?id= form is still honoured because links to it are already in the
// wild, in feeds and in anything anyone bookmarked before 2026-09-08.
function FromUrl() {
  const path = usePathname();
  const fromPath = path?.startsWith("/event/")
    ? decodeURIComponent(path.slice("/event/".length))
    : null;
  // Called unconditionally: `fromPath || useSearchParams()` would skip a hook
  // on the renders where the path already carried the id.
  const fromQuery = useSearchParams().get("id");
  const id = fromPath || fromQuery;
  return <EventDetail id={id} />;
}

export default function EventPage() {
  return (
    <Suspense fallback={<p className="mono dim">retrieving the record…</p>}>
      <FromUrl />
    </Suspense>
  );
}
