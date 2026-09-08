"use client";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FondsDetail } from "@/components/FondsDetail";

// The fall-through route for files opened since the last build — see the
// long note in app/event/page.tsx, which this mirrors exactly.
function FromUrl() {
  const path = usePathname();
  const fromPath = path?.startsWith("/civilization/")
    ? decodeURIComponent(path.slice("/civilization/".length))
    : null;
  // Called unconditionally: `fromPath || useSearchParams()` would skip a hook
  // on the renders where the path already carried the id.
  const fromQuery = useSearchParams().get("id");
  const id = fromPath || fromQuery;
  return <FondsDetail id={id} />;
}

export default function CivilizationPage() {
  return (
    <Suspense fallback={<p className="mono dim">retrieving the record…</p>}>
      <FromUrl />
    </Suspense>
  );
}
