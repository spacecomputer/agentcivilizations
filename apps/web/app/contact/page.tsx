// The contact page.
//
// It exists because people kept asking for it: /contact was the second most
// landed-on address on the site over three weeks — 25 sessions — and it was
// a 404. Some of that is scanners looking for a form to spam, but a register
// that names companies and people needs a published way to be reached, and
// "we don't have that page" is the wrong answer to give either audience.
//
// No form. A form would need a backend, and the whole point of this site is
// that it has no write path a stranger can reach.

const REPO = "https://github.com/spacecomputer/agentcivilizations";

export const metadata = {
  title: "Contact",
  description:
    "How to reach the Agent Civilizations register: corrections to an entry, " +
    "a private channel before publication, security reports, and press enquiries.",
  alternates: { canonical: "https://agentcivilizations.org/contact" },
};

export default function ContactPage() {
  return (
    <>
      <span className="caps kicker">Reaching the register</span>
      <h1>Contact</h1>
      <p className="preamble">
        Everything here is public by default, including the way you reach us.
        That is a deliberate choice for a record whose value is that its
        workings can be inspected — but it is not the only route, and the
        exceptions are named below.
      </p>
      <div className="rule-double" />

      <h3>An entry about you or your organisation is wrong</h3>
      <p>
        This is the one we most want to hear about, and the fastest route is{" "}
        <a href={`${REPO}/issues`}>the public issue tracker</a>. Quote the
        entry&apos;s permalink or its <span className="mono">contentHash</span>,
        both printed at the top of every entry page, and say what is wrong.
      </p>
      <p>
        We do not delete entries — deleting one would break the chain that makes
        every other entry worth reading. A wrong entry is superseded by a new
        one naming it, giving a reason from a closed list, and carrying an
        explanation in plain words. The mistake and the correction both stay on
        the record, and the original entry then displays a notice pointing at
        its correction. That is slower than a quiet edit and it is the point.
      </p>

      <h3>You need a private channel first</h3>
      <p>
        If the matter is legal, pre-publication, or concerns a named individual,
        use{" "}
        <a href={`${REPO}/security/advisories/new`}>
          GitHub&apos;s private advisory form
        </a>
        . It is private to the maintainers, needs no mail server, and keeps the
        report and the response in one place. Say plainly that it is a
        correction rather than a vulnerability and it will be handled as one.
      </p>
      <p>
        There is deliberately no email address on this page.{" "}
        <span className="mono">agentcivilizations.org</span> publishes no MX
        record, so an address here would silently swallow what you sent rather
        than deliver it. An address that discards mail is worse than an awkward
        form that does not.
      </p>

      <h3>Security</h3>
      <p>
        Same private form, and the policy is at{" "}
        <a href={`${REPO}/blob/main/SECURITY.md`}>SECURITY.md</a> and{" "}
        <a href="/.well-known/security.txt">/.well-known/security.txt</a>. In
        scope: anything that would let history be altered without the verifier
        flagging it, anything that would let an unprivileged user write to the
        database, and anything that injects content into another reader&apos;s
        page. We aim to respond within 72 hours.
      </p>

      <h3>Press and research</h3>
      <p>
        Most of what you need is already published rather than gated:{" "}
        <a href="/reference">the reference desk</a> carries citation formats, a
        sealed snapshot for any day, headline figures as JSON and CSV, both
        feeds, and the list of things this record cannot tell you. If you want
        something that is not there, the issue tracker is the place to ask, and
        the answer will be added to the desk rather than sent only to you.
      </p>

      <h3>Before you write</h3>
      <p>
        Two questions answer themselves. If you are wondering whether an entry
        is corroborated, the confidence tier is printed on it —{" "}
        <span className="mono">CONFIRMED</span> means independent sources,{" "}
        <span className="mono">CANDIDATE</span> means reported and not yet
        corroborated. And if you want to know whether the record has been
        altered since you cited it, you do not need us at all:
      </p>
      <div className="panel">
        <div className="prov-line">npx @agent-civilizations/verify --event=&lt;id&gt;</div>
      </div>
      <p>
        If that disagrees with this website, it is right and the website is
        wrong. Tell us either way.
      </p>

      <div className="rule-double" />
      <p className="mono dim">
        CORRECTIONS ARE ENTRIES, NOT DELETIONS ·{" "}
        <a href="/corrections.xml">CORRECTIONS FEED</a> ·{" "}
        <a href={`${REPO}/issues`}>ISSUE TRACKER</a>
      </p>
    </>
  );
}
