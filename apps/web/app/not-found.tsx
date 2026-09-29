// The 404.
//
// Until now this was Next's stock error component: pure black, a bare "404",
// no way back, and — the part that actually cost something — no <title>, so
// the browser tab read as the homepage. It is also the page every stale link,
// every mistyped address and every scanner lands on, which over three weeks
// was 13% of all recorded sessions.
//
// Under `output: "export"` this renders to 404.html, which Firebase Hosting
// serves with a real 404 status for any address that is not a file and not a
// rewrite. Entry and file URLs never reach it: firebase.json falls
// /event/** and /civilization/** through to the live-reading shells, so a
// record mined since the last build still resolves.

export const metadata = {
  title: "No such page",
  description: "This address is not part of the register.",
};

export default function NotFound() {
  return (
    <>
      <span className="caps kicker">No. 404</span>
      <h1>This address is not in the register</h1>
      <p className="preamble">
        Nothing has been removed. Entries are never deleted here — a wrong one
        is superseded by a correction and both stay on the record — so a page
        that is missing was never at this address, rather than taken down from
        it.
      </p>
      <div className="rule-double" />

      <h3>If you followed a link to an entry</h3>
      <p>
        Records live at{" "}
        <span className="mono">/event/&lt;id&gt;</span> and files at{" "}
        <span className="mono">/civilization/&lt;slug&gt;</span>. Both resolve
        even for records mined in the last few minutes. If you have the
        entry&apos;s <span className="mono">contentHash</span> but not its
        address, it can be found from the hash alone:
      </p>
      <div className="panel">
        <div className="prov-line">npx @agent-civilizations/verify --event=&lt;id&gt;</div>
      </div>

      <h3>Where you probably meant to go</h3>
      <div className="tablewrap">
        <table>
          <caption className="sr-only">Pages of the register</caption>
          <thead>
            <tr>
              <th>Page</th>
              <th>What is on it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><a href="/">The Register</a></td>
              <td>Every entry, newest first, with each day&apos;s sealed root</td>
            </tr>
            <tr>
              <td><a href="/civilizations">Civilizations</a></td>
              <td>The catalog of files, with spans and status</td>
            </tr>
            <tr>
              <td><a href="/reference">Reference</a></td>
              <td>Citation, bulk data, endpoints, and the record&apos;s limits</td>
            </tr>
            <tr>
              <td><a href="/about">Methodology</a></td>
              <td>What is entered, how, and by which models</td>
            </tr>
            <tr>
              <td><a href="/verify">Certify</a></td>
              <td>Recompute the chain in your own browser</td>
            </tr>
            <tr>
              <td><a href="/contact">Contact</a></td>
              <td>Corrections, private channels, security</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rule-double" />
      <p className="mono dim">
        THE RECORD IS UNAFFECTED BY THIS PAGE ·{" "}
        <a href="/api/health.json">HEALTH</a> ·{" "}
        <a href="/feed.xml">ATOM FEED</a>
      </p>
    </>
  );
}
