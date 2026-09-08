"use client";
import { useEffect, useState } from "react";
import { latestRoot } from "@/lib/queries";
import type { Root } from "@agent-civilizations/schema";

// The reference desk — for the press and for research.
//
// Two audiences, one obligation: give them what they need to be right,
// including the ways this record could make them wrong. Every figure on
// this page is fetched live, and every example uses the most recently
// sealed day rather than a date typed into the source.

const SITE = "https://agentcivilizations.org";
const REPO = "https://github.com/spacecomputer/agentcivilizations";

interface Figures {
  events: number;
  confirmed: number;
  candidate: number;
  civilizations: number;
  sealedDays: number;
  sealedThrough: string | null;
  earliestOccurrence: string | null;
  registerOpened: string | null;
}

export default function ReferencePage() {
  const [root, setRoot] = useState<Root | null>(null);
  const [fig, setFig] = useState<Figures | null>(null);

  useEffect(() => {
    let off = false;
    latestRoot().then((r) => !off && setRoot(r)).catch(() => {});
    fetch("/api/figures.json")
      .then((r) => r.json())
      .then((f) => !off && setFig(f))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);

  const day = root?.id ?? "YYYY-MM-DD";
  const hash = root?.merkleRoot ?? "";
  const short = hash ? `${hash.slice(0, 16)}…` : "…";

  return (
    <>
      <span className="caps kicker">For the press and for research</span>
      <h1>The reference desk</h1>
      <p className="preamble">
        This register exists to be used by people who have to be accurate for
        a living. What follows is how to cite it, how to get the data out of
        it, how to check it without our help, and the two ways it could
        mislead you if you are not careful.
      </p>
      <div className="rule-double" />

      <h3>What this is, and what it is not</h3>
      <p>
        It is an index of publicly reported events in which AI agents
        coordinate, attack, or form persistent communities, with the
        underlying sources attached to every entry, hash-chained so nothing
        can be quietly changed afterwards.
      </p>
      <p>
        It is <em>not</em> a primary source. We did not witness these events;
        we recorded that somebody reported them. It is not a threat feed and
        nothing here is an alert. It is not complete, and it is not a sample
        drawn from any defined population, so it does not support a rate or
        a per-capita claim. Treat it as a finding aid with a tamper-evident
        memory.
      </p>

      <h3>Before you publish</h3>
      <p>
        <strong>Cite the source, not us.</strong> Every entry links the
        reporting it rests on. If the story is real, it is real because of
        that reporting. Use us to find it, to see what else connects to it,
        and to prove the record has not moved since.
      </p>
      <p>
        <strong>A candidate is not a finding.</strong> An entry marked{" "}
        <strong>CANDIDATE</strong> has one source and has not been
        corroborated.{" "}
        {fig && (
          <>
            Today {fig.candidate} of {fig.events} entries are candidates.{" "}
          </>
        )}
        If you report one, say so in those terms: <em>a single report,
        recorded but not corroborated</em>. Only <strong>CONFIRMED</strong>{" "}
        entries have cleared the independence test described in the{" "}
        <a href="/about">methodology</a>.
      </p>
      <p>
        <strong>Do not draw a growth curve across our start date.</strong>{" "}
        This is the mistake this dataset most invites. Our coverage reaches
        back years, but our sensitivity changed the day the scanner switched
        on{fig?.registerOpened ? ` (${fig.registerOpened.slice(0, 10)})` : ""}.
        A chart of entries per month will therefore show a near-vertical
        climb at the right that is substantially us arriving, not the world
        changing. We cannot tell you the proportion, so neither can you. If
        you need a trend, use the occurrence dates and say plainly that
        coverage before our opening is reconstructed from later reporting.
        The same warning applies to every dated change in our source list,
        each of which is drawn on the coverage plate: a trend read across one
        of those rules is measuring us, not the world.
      </p>

      <h3>Citing one entry</h3>
      <p>
        Every entry has a permalink, a record number, and a content hash that
        is the entry itself, not a database key. Cite the hash if you want a
        reference that cannot drift:
      </p>
      <div className="panel">
        <div className="prov-line">
          Agent Civilizations, record No. 746, file OPENAI-REBEL-AGENT-SWARM,
        </div>
        <div className="prov-line">
          contentHash aedd7200…, {SITE}/event?id=&lt;id&gt;
        </div>
      </div>

      <h3>Citing a snapshot</h3>
      <p>
        This is the part worth knowing. Because every day is sealed into a
        root and anchored in Bitcoin, you can cite the register{" "}
        <em>as it stood on a date</em>, and anyone can reconstruct exactly
        that dataset and prove it has not changed since. Most datasets cannot
        offer that.
      </p>
      <div className="panel">
        <div className="prov-line">{`${SITE}/api/snapshot/${day}.json`}</div>
        <p className="dim" style={{ marginTop: "10px" }}>
          Everything sealed through {day}: every entry, every file, every root
          to that point. Its own roots reseal from its own contents, so the
          file proves itself.{" "}
          {root && (
            <>
              The root for {day} is <span className="mono">{short}</span>
              {root.otsBitcoinBlockHeight ? (
                <>, anchored in Bitcoin block{" "}
                  <span className="mono">{root.otsBitcoinBlockHeight}</span>.</>
              ) : (
                <>, with its Bitcoin attestation pending aggregation.</>
              )}
            </>
          )}
        </p>
      </div>
      <p>For a bibliography:</p>
      <div className="panel">
        <div className="prov-line">@misc{`{agentcivilizations,`}</div>
        <div className="prov-line">
          {"  "}title = {`{{Agent Civilizations: a hash-chained register of AI-agent events}}`},
        </div>
        <div className="prov-line">{"  "}author = {`{{Agent Civilizations}}`},</div>
        <div className="prov-line">{"  "}year = {`{2026}`},</div>
        <div className="prov-line">{"  "}url = {`{${SITE}}`},</div>
        <div className="prov-line">
          {"  "}note = {`{Snapshot sealed ${day}, root ${hash || "…"}}`}
        </div>
        <div className="prov-line">{`}`}</div>
      </div>

      <h3>Getting the data</h3>
      <div className="tablewrap">
        <table>
          <caption className="sr-only">Public endpoints</caption>
          <thead>
            <tr>
              <th>What</th>
              <th>Where</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>A sealed snapshot</td>
              <td className="mono">/api/snapshot/{day}.json</td>
            </tr>
            <tr>
              <td>Headline figures</td>
              <td className="mono">
                <a href="/api/figures.json">/api/figures.json</a> ·{" "}
                <a href="/api/figures.csv">/api/figures.csv</a>
              </td>
            </tr>
            <tr>
              <td>New entries</td>
              <td className="mono">
                <a href="/feed.xml">/feed.xml</a>
              </td>
            </tr>
            <tr>
              <td>Corrections</td>
              <td className="mono">
                <a href="/corrections.xml">/corrections.xml</a>
              </td>
            </tr>
            <tr>
              <td>A day&apos;s Bitcoin proof</td>
              <td className="mono">/api/roots/{day}/ots</td>
            </tr>
            <tr>
              <td>Live queries</td>
              <td className="mono">Firestore REST, read-open, no key</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Everything is CORS-open and needs no account. The live collections are{" "}
        <span className="mono">events</span>,{" "}
        <span className="mono">civilizations</span> and{" "}
        <span className="mono">roots</span>; the{" "}
        <a href={`${REPO}/blob/main/packages/verify/src/cli.ts`}>verifier source</a>{" "}
        shows the exact REST calls if you want to query them directly.
      </p>

      <h3>Checking it without us</h3>
      <p>
        One command, no account, no clone. It reads public endpoints,
        recomputes every hash locally, and exits non-zero if anything fails
        to reproduce:
      </p>
      <div className="panel">
        <div className="prov-line">npx @agent-civilizations/verify --root={day}</div>
        <div className="prov-line">npx @agent-civilizations/verify --event=&lt;id&gt;</div>
      </div>
      <p>
        The second proves a single entry belongs to its sealed day. If the
        verifier ever disagrees with this website, the verifier is right. See{" "}
        <a href="/verify">the certification console</a> for the same checks in
        your browser.
      </p>

      <h3>If we retract something you cited</h3>
      <p>
        We never delete an entry. A wrong one is superseded by a new entry
        naming it and giving a reason, and the retracted entry then carries a
        notice forward to its correction. If you have published on this
        record, subscribe to{" "}
        <a href="/corrections.xml">the corrections feed</a>; it exists
        precisely so that a citation of ours cannot quietly rot inside your
        work.
      </p>

      <h3>Terms</h3>
      <p>
        The register&apos;s own summaries, classifications and metadata are
        dedicated to the public domain under{" "}
        <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer noopener">
          CC0 1.0
        </a>
        . Use them for anything, without permission or attribution, though we
        would rather you credited the register so your readers can check it.
        The underlying sources we quote and link retain their own rights, and
        the excerpts we store are short and kept for auditability. The code is
        MIT.
      </p>

      <h3>Press kit</h3>
      <p>
        Current figures are machine-readable at{" "}
        <a href="/api/figures.json">/api/figures.json</a> and{" "}
        <a href="/api/figures.csv">/api/figures.csv</a>, regenerated
        continuously, so nothing here needs transcribing.
      </p>
      {fig && (
        <div className="tablewrap">
          <table>
            <caption className="sr-only">Current figures</caption>
            <tbody>
              <tr><td>Entries</td><td className="num mono">{fig.events}</td></tr>
              <tr><td>Confirmed</td><td className="num mono">{fig.confirmed}</td></tr>
              <tr><td>Candidate</td><td className="num mono">{fig.candidate}</td></tr>
              <tr><td>Files</td><td className="num mono">{fig.civilizations}</td></tr>
              <tr><td>Days sealed</td><td className="num mono">{fig.sealedDays}</td></tr>
              <tr>
                <td>Earliest event recorded</td>
                <td className="num mono">{fig.earliestOccurrence?.slice(0, 10) ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p>
        Marks and wordmark: <a href="/icon.svg">the seal</a> and{" "}
        <a href="/og.svg">the card</a>, both SVG and both CC0 with the rest.
        Set in Archivo, Literata and IBM Plex Mono.
      </p>
      <p>
        A sentence you may paste, and which we would rather you used than one
        we have to correct later:{" "}
        <em>
          Agent Civilizations is an open, hash-chained register of publicly
          reported AI-agent events, sealed daily and anchored to Bitcoin;
          entries marked candidate rest on a single uncorroborated report.
        </em>
      </p>

      <h3>What this record cannot tell you</h3>
      <p>
        The feeds read English, Chinese and Russian and nothing else, and
        follow what news covers, so the record is thinner where reporting is
        thinner, which is not the same as where events are rarer. The
        non-English sources were added on 2026-09-08: anything recorded before
        that was found through English coverage alone, which is a step change
        in sensitivity and is drawn as such on the coverage plate. Most files rest on a single entry. Placements
        on <a href="/survey">the Survey</a> come mostly from a list of
        organisations we curated by hand, so the map reflects our choices as
        much as the world&apos;s. And the register is young: it can show its
        coverage of years, but it cannot yet measure a trend. The{" "}
        <a href="/about">methodology</a> states each of these in full.
      </p>

      <h3>Contact</h3>
      <p>
        Corrections, questions and requests go to{" "}
        <a href={`${REPO}/issues`}>the public issue tracker</a>, where the
        exchange stays on the record like everything else here. If you need to
        reach us before publication and cannot do so publicly, open an issue
        saying so and we will find another way.
      </p>

      <div className="rule-double" />
      <p className="mono dim">
        REGISTER SUMMARIES AND METADATA: CC0 1.0 · CODE: MIT ·{" "}
        <a href={REPO}>GITHUB.COM/SPACECOMPUTER/AGENTCIVILIZATIONS</a>
      </p>
    </>
  );
}
