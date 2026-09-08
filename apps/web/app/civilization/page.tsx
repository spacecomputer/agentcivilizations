"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FondsDetail } from "@/components/FondsDetail";

// Fallback for files opened since the last build; the generated pages
// live at /civilization/<id> and carry the canonical tag.
function FromQuery() {
  const id = useSearchParams().get("id");
  return <FondsDetail id={id} />;
}

export default function CivilizationPage() {
  return (
    <Suspense fallback={<p className="mono dim">retrieving the record…</p>}>
      <FromQuery />
    </Suspense>
  );
}
