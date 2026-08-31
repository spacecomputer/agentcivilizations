"use client";
import { useState } from "react";
import { eventsForCivilization } from "@/lib/queries";
import { verifyChain } from "@agent-civilizations/verify";

export default function VerifyPage() {
  const [civId, setCivId] = useState("");
  const [state, setState] = useState<
    { status: "idle" | "running" | "ok" | "fail"; detail?: string }
  >({ status: "idle" });

  async function run() {
    if (!civId.trim()) return;
    setState({ status: "running" });
    try {
      const events = await eventsForCivilization(civId.trim());
      if (events.length === 0) {
        setState({ status: "fail", detail: "no events found for that civilization id" });
        return;
      }
      const result = await verifyChain(events);
      if (result.ok) {
        setState({ status: "ok", detail: `${result.verified} events verified end-to-end` });
      } else {
        setState({
          status: "fail",
          detail: `broken at event ${result.brokenAt} (${result.reason})`,
        });
      }
    } catch (err) {
      setState({ status: "fail", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <>
      <h1>Verify the ledger</h1>
      <p className="lede">
        The verifier recomputes each event&apos;s <code>contentHash</code> from its canonicalized JSON
        and asserts each <code>prevHash</code> matches the previous event&apos;s
        hash. If any event was silently edited or reordered, this check fails.
      </p>
      <p style={{ color: "var(--fg-dim)", fontSize: "0.9rem" }}>
        The verifier runs entirely in your browser, reading directly from Firestore&apos;s
        public REST endpoints. No trust in us required.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", margin: "1.5rem 0" }}>
        <input
          type="text"
          placeholder="civilization id (e.g. autogpt-swarm)"
          value={civId}
          onChange={(e) => setCivId(e.target.value)}
          style={{ flex: 1 }}
        />
        <button onClick={run} disabled={state.status === "running"}>
          Verify
        </button>
      </div>
      {state.status !== "idle" && (
        <div className="verify-panel">
          <div className={state.status === "ok" ? "verify-ok" : state.status === "fail" ? "verify-fail" : ""}>
            {state.status === "running" ? "verifying…" : state.detail}
          </div>
        </div>
      )}
      <h2>Or from the command line</h2>
      <pre className="verify-panel">
        <code>npx @agent-civilizations/verify --civilization={"<id>"}</code>
      </pre>
    </>
  );
}
