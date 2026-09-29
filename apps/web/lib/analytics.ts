"use client";
// Google Analytics (GA4) via the Firebase Analytics SDK.
//
// Loaded lazily and only in a real browser session: the SDK is imported
// dynamically so it stays out of the first-load bundle, and it is never
// initialised during the static export, on localhost, or when the
// measurement id is absent. Failure to load is silent by design — a
// reader who blocks analytics must still get the whole register, and the
// verification path must never depend on it.

import type { Analytics } from "firebase/analytics";
import { firebaseConfig, getFirebaseApp } from "./firebase";

let analytics: Analytics | null = null;
let started: Promise<Analytics | null> | null = null;

/**
 * Readers who have asked not to be measured are not measured. Both the
 * legacy Do Not Track header and the Global Privacy Control signal are
 * honoured; drop this function to collect from everyone.
 */
export function readerOptedOut(): boolean {
  if (typeof window === "undefined") return true;
  const nav = window.navigator as Navigator & {
    doNotTrack?: string | null;
    msDoNotTrack?: string | null;
    globalPrivacyControl?: boolean;
  };
  const dnt =
    nav.doNotTrack ??
    (window as unknown as { doNotTrack?: string | null }).doNotTrack ??
    nav.msDoNotTrack;
  return dnt === "1" || dnt === "yes" || nav.globalPrivacyControl === true;
}

/**
 * Automated clients are not readers.
 *
 * Three weeks of GA showed 79% of sessions with zero engagement, a spike on
 * the day a build-and-audit run drove headless Chrome over every page, and
 * /contact — which does not exist — as the second most landed-on address.
 * None of that is people, and all of it was being counted, which makes the
 * only number that matters unreadable.
 *
 * navigator.webdriver is set by every WebDriver-controlled browser, headless
 * Chrome included, and is not set for ordinary readers. It is the cheapest
 * honest cut available client-side. It will not catch a crawler that spoofs
 * it, and it does not need to: the point is to stop measuring ourselves.
 */
function automatedClient(): boolean {
  const nav = window.navigator as Navigator & { webdriver?: boolean };
  if (nav.webdriver === true) return true;
  // Headless builds still identify themselves in the UA string.
  return /\bHeadless/i.test(nav.userAgent || "");
}

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!firebaseConfig.measurementId) return false;
  // Local development and emulator runs must not report.
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "") return false;
  // Only the canonical host. The web.app mirror and any preview deployment
  // would otherwise double-count the same page against the same property.
  if (host !== "agentcivilizations.org") return false;
  if (automatedClient()) return false;
  return !readerOptedOut();
}

/** Initialise once. Returns null when analytics is not to be used here. */
export async function startAnalytics(): Promise<Analytics | null> {
  if (!enabled()) return null;
  if (started) return started;
  started = (async () => {
    try {
      const { getAnalytics, isSupported } = await import("firebase/analytics");
      // isSupported() is false where the SDK cannot run at all: no
      // IndexedDB, no cookies, some in-app and privacy browsers.
      if (!(await isSupported())) return null;
      analytics = getAnalytics(getFirebaseApp());
      return analytics;
    } catch {
      return null;
    }
  })();
  return started;
}

/**
 * Report a page view for a client-side navigation.
 *
 * getAnalytics() reports the first view itself, so this is only called
 * for navigations after it. If GA4's Enhanced Measurement also has
 * "page changes based on browser history events" switched on, turn that
 * off in the GA4 property, or every in-site navigation is counted twice.
 */
export async function logPageView(path: string, title?: string): Promise<void> {
  const a = await startAnalytics();
  if (!a) return;
  try {
    const { logEvent } = await import("firebase/analytics");
    logEvent(a, "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: title ?? document.title,
    });
  } catch {
    // A failed beacon is not a failed page.
  }
}

/** Report a named event. Same silence-on-failure contract. */
export async function logAnalyticsEvent(
  name: string,
  params?: Record<string, unknown>,
): Promise<void> {
  const a = await startAnalytics();
  if (!a) return;
  try {
    const { logEvent } = await import("firebase/analytics");
    logEvent(a, name, params);
  } catch {
    // ignored
  }
}
