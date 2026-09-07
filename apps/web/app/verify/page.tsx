"use client";
import { useRef, useState } from "react";
import { allEvents, allRoots } from "@/lib/queries";
import { certify, type CertifyProgress, type CertifyResult } from "@/lib/certify";
import { Tick } from "@/components/marks";
import { HashBlock } from "@/components/HashBlock";
import { recordNo, utcStamp, shortHash } from "@/lib/format";

type ConsoleState =
  | { phase: "idle" }
  | { phase: "retrieving" }
  | { phase: "running"; progress: CertifyProgress }
  | { phase: "done"; result: CertifyResult; progress: CertifyProgress; at: string };

// Character-by-character diff: the computed value with every position that
// disagrees with the expected value set in the discrepancy ink.
function HashDiff({ expected, computed }: { expected: string; computed: string }) {
  const len = Math.max(expected.length, computed.length);
  const spans: React.ReactNode[] = [];
  let run = "";
  let runBad = false;
  for (let i = 0; i < len; i++) {
    const bad = expected[i] !== computed[i];
    const ch = computed[i] ?? "·";
    if (bad !== runBad && run) {
      spans.push(
        runBad ? (
          <span key={i} className="diff-bad">{run}</span>
        ) : (
          <span key={i}>{run}</span>
        ),
      );
      run = "";
    }
    runBad = bad;
    run += ch;
  }
  if (run)
    spans.push(
      runBad ? (
        <span key="last" className="diff-bad">{run}</span>
      ) : (
        <span key="last">{run}</span>
      ),
    );
  return <span className="mono">{spans}</span>;
}

export default function VerifyPage() {
  const [state, setState] = useState<ConsoleState>({ phase: "idle" });
  const [attestCopied, setAttestCopied] = useState(false);
  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  async function run() {
    setState({ phase: "retrieving" });
    try {
      const [events, roots] = await Promise.all([allEvents(), allRoots()]);
      if (!events.length) {
        setState({
          phase: "done",
          result: {
            ok: true,
            recordsVerified: 0,
            daysVerified: 0,
            terminalHash: null,
            elapsedMs: 0,
            discrepancy: null,
          },
          progress: { recordsDone: 0, recordsTotal: 0, dayResults: [] },
          at: utcStamp(new Date().toISOString()),
        });
        return;
      }
      const rootMap = new Map(roots.map((r) => [r.id, r]));
      let latest: CertifyProgress = {
        recordsDone: 0,
        recordsTotal: events.length,
        dayResults: [],
      };
      const result = await certify(
        events,
        rootMap,
        (p) => {
          latest = { ...p, dayResults: [...p.dayResults] };
          // Under reduced motion the console skips the ticking and renders
          // the finished attestation instantly.
          if (!reducedMotion.current) {
            setState({ phase: "running", progress: latest });
          }
        },
        { full: true },
      );
      setState({
        phase: "done",
        result,
        progress: latest,
        at: utcStamp(new Date().toISOString()),
      });
    } catch {
      setState({ phase: "idle" });
    }
  }

  async function copyAttestation() {
    if (state.phase !== "done") return;
    const r = state.result;
    const text = `AgentCivilizations.org attestation · ${r.ok ? "CHAIN INTACT" : "CERTIFICATION FAILED"} · ${r.recordsVerified} records · ${r.daysVerified} sealed roots${r.terminalHash ? ` · terminal ${r.terminalHash}` : ""} · recomputed in-browser in ${(r.elapsedMs / 1000).toFixed(1)}s · ${state.at}`;
    try {
      await navigator.clipboard.writeText(text);
      setAttestCopied(true);
      setTimeout(() => setAttestCopied(false), 1600);
    } catch {
      // clipboard unavailable
    }
  }

  const progress =
    state.phase === "running" || state.phase === "done" ? state.progress : null;

  return (
    <>
      <span className="caps kicker">The certification console</span>
      <h1>Certify the record</h1>
      <p className="preamble">
        What follows is computed by your browser, using the Web Crypto API,
        reading the public database directly. No server of ours takes part.
        Your browser recomputes the hash of every record from its contents,
        confirms each record binds to the one before it, and re-derives every
        daily root against the sealed value. A pass proves that no entry in
        the register has been altered or reordered since its day was sealed.
      </p>
      <p className="dim" style={{ maxWidth: "68ch" }}>
        It does not prove our classifier&apos;s judgment, nor that nothing was
        omitted at ingestion. Those questions are answered by the public
        sources on every record and the public methodology.
      </p>

      <div style={{ margin: "24px 0" }}>
        <button
          type="button"
          className="certify-btn"
          onClick={run}
          disabled={state.phase === "retrieving" || state.phase === "running"}
        >
          Certify the record
        </button>
      </div>

      {/* One coarse live region: announces start and verdict, never the
          per-frame counter — a per-record live region floods screen readers. */}
      <p className="sr-only" role="status">
        {state.phase === "retrieving" && "Retrieving the record."}
        {state.phase === "running" && "Certification in progress."}
        {state.phase === "done" &&
          (state.result.ok
            ? `Chain intact. ${state.result.recordsVerified} records and ${state.result.daysVerified} sealed roots recomputed.`
            : `Certification failed at ${recordNo(state.result.discrepancy?.recordNo ?? 0)}.`)}
      </p>

      {state.phase === "retrieving" && (
        <p className="mono dim">retrieving the record…</p>
      )}

      {(state.phase === "running" || state.phase === "done") && (
        <div className="console">
          {progress?.dayResults.map((d) => (
            <div className="crow" key={d.day}>
              <span className="cd">{d.day}</span>
              <span className="ch">
                root {shortHash(d.computedRoot)} · {d.eventCount}{" "}
                {d.eventCount === 1 ? "event" : "events"}
                {d.sealedRoot === null && " · unsealed (open day)"}
              </span>
              <span className={`cv${d.ok ? "" : " fail"}`}>
                {d.ok ? (d.sealedRoot ? "intact" : "open") : "DISCREPANCY"}
              </span>
            </div>
          ))}
          {progress && (
            <div className="counter">
              {recordNo(progress.recordsDone)} of{" "}
              {progress.recordsTotal.toLocaleString("en-US")} records recomputed
            </div>
          )}

          {state.phase === "done" && (
            <div className={`attest${state.result.ok ? "" : " failed"}`}>
              {state.result.ok ? (
                <>
                  <div className="a1">
                    <Tick size={14} />
                    Chain intact — {state.result.recordsVerified} records,{" "}
                    {state.result.daysVerified} sealed roots
                  </div>
                  {state.result.terminalHash && (
                    <div className="a2 terminal-hash">
                      terminal <HashBlock hash={state.result.terminalHash} copyable={false} />
                    </div>
                  )}
                  <div className="a2">
                    recomputed in this browser in{" "}
                    {(state.result.elapsedMs / 1000).toFixed(1)}s · {state.at} ·{" "}
                    <button
                      type="button"
                      className="hash-control"
                      onClick={copyAttestation}
                    >
                      {attestCopied ? "copied" : "copy attestation"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="a1">
                    Certification failed — first discrepancy at{" "}
                    {state.result.discrepancy?.reason === "root"
                      ? `the root of ${state.result.discrepancy.eventId}`
                      : recordNo(state.result.discrepancy?.recordNo ?? 0)}
                  </div>
                  {state.result.discrepancy && (
                    <div className="a2">
                      <div>
                        expected{" "}
                        <span className="mono">
                          {state.result.discrepancy.expected}
                        </span>
                      </div>
                      <div>
                        computed{" "}
                        <HashDiff
                          expected={state.result.discrepancy.expected}
                          computed={state.result.discrepancy.computed}
                        />
                      </div>
                      {state.result.discrepancy.reason !== "root" && (
                        <div>
                          <a
                            href={`/event?id=${encodeURIComponent(state.result.discrepancy.eventId)}`}
                          >
                            open the record
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      <h3>From the command line</h3>
      <p>
        The same arithmetic, off our servers. It reads Firestore&apos;s public
        endpoints directly and recomputes every hash on your machine; it needs
        no account and no key. If it disagrees with this page, believe it.
      </p>
      <div className="panel">
        <div className="prov-line">
          git clone https://github.com/spacecomputer/agentcivilizations
        </div>
        <div className="prov-line">
          cd agentcivilizations &amp;&amp; npm install
        </div>
        <div className="prov-line">npm run build -w packages/verify</div>
        <div className="prov-line">
          node packages/verify/dist/cli.js --civilization=&lt;file&gt;
        </div>
        <div className="prov-line">
          node packages/verify/dist/cli.js --root=YYYY-MM-DD
        </div>
        <div className="prov-line">
          node packages/verify/dist/cli.js --event=&lt;entry&gt;
        </div>
        <p className="dim" style={{ marginTop: "10px" }}>
          The first of those three walks a file&apos;s chain, the second reseals a
          day and compares it with the sealed root, the third proves one entry
          sits inside a sealed day. Add <span className="mono">--json</span> for
          machine-readable output. The source is{" "}
          <a
            href="https://github.com/spacecomputer/agentcivilizations/tree/main/packages/verify"
            target="_blank"
            rel="noreferrer noopener"
          >
            packages/verify
          </a>
          . It declares no dependencies of its own and talks only to public
          endpoints, so the clone is the whole of it.
        </p>
        <p className="dim">
          The verifier is not yet published to npm, and this page will not print
          a command it cannot keep. When it is published, these five lines become
          one <span className="mono">npx</span> invocation.
        </p>
      </div>

      <h3>Proving one entry, not a whole day</h3>
      <p>
        A day is sealed as a Merkle tree over its entries. To check a single
        entry you do not need the rest of the day: you need that entry and
        about a dozen sibling hashes, which fold back into the day&apos;s root.
        A wrong path cannot reach an anchored root, so the proof stands on its
        own. Every entry page carries the button that does it. Days sealed
        before the tree shipped keep their original root and their Bitcoin
        anchor, and are checked by reproducing the whole day instead — a root
        is never recomputed under a new algorithm.
      </p>

      <h3>Bitcoin-anchored root proofs</h3>
      <p>
        Each sealed daily root is submitted to the public{" "}
        <a href="https://opentimestamps.org/" target="_blank" rel="noreferrer noopener">
          OpenTimestamps
        </a>{" "}
        calendars, which aggregate submissions into a Bitcoin transaction.
        Once Bitcoin confirms the aggregation (usually within a day), the
        proof carries the Bitcoin block header — an independently
        verifiable claim that our merkleRoot existed no later than that
        block&apos;s timestamp. Neither we, nor the calendars, need to be
        trusted.
      </p>
      <div className="panel">
        <div className="prov-line">
          curl -o day.ots https://agentcivilizations.org/api/roots/YYYY-MM-DD/ots
        </div>
        <div className="prov-line">
          ots verify --raw &lt;merkleRoot-hex&gt; day.ots
        </div>
      </div>
    </>
  );
}
