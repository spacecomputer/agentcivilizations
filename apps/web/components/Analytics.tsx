"use client";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { logPageView, startAnalytics } from "@/lib/analytics";

// Page views for a static export with client-side routing.
//
// The register addresses records by path (/event/<id>), so a view
// is the pathname plus its search, not the pathname alone. The Firebase
// SDK reports the first view when it initialises; this reports only the
// navigations after it, so nothing is counted twice.
//
// useSearchParams suspends during prerender, so the reporter sits inside
// its own Suspense boundary and renders nothing either way.

function Reporter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const first = useRef(true);

  useEffect(() => {
    void startAnalytics();
  }, []);

  useEffect(() => {
    const qs = searchParams.toString();
    const path = qs ? `${pathname}?${qs}` : pathname;
    if (first.current) {
      // The SDK already reported this one on initialisation.
      first.current = false;
      return;
    }
    void logPageView(path);
  }, [pathname, searchParams]);

  return null;
}

export function Analytics() {
  return (
    <Suspense fallback={null}>
      <Reporter />
    </Suspense>
  );
}
