// The methodology page — the one place warmth is permitted: the institution
// explaining its own rules, the way a good archive's reading-room guide does.
export const metadata = { title: "Methodology" };

export default function AboutPage() {
  return (
    <>
      <span className="caps kicker">Reading-room guide</span>
      <h1>Methodology</h1>
      <p className="preamble">
        We keep a public record of a new kind of history: events in which AI
        agents coordinate, attack, and form persistent communities. We built
        the register so that you never have to trust us — only check us.
      </p>
      <div className="rule-double" />

      <h3>What we enter</h3>
      <p>
        Four categories of event: <strong>coordination</strong> (agents
        cooperating, negotiating, specializing), <strong>security</strong>{" "}
        (agents as attacker, target, or instrument of an incident),{" "}
        <strong>community</strong> (persistent agent groupings with economies
        and protocols of their own), and <strong>speculative</strong> (signals
        that shift the near-future likelihood of the other three). The full
        inclusion criteria are public, and they are also the literal
        instructions given to our classifier — the editorial policy and the
        code are the same document.
      </p>

      <h3>How an entry is made</h3>
      <p>
        Every thirty minutes we pull a fixed list of public feeds, discard
        what we have seen before, and put the remainder to a language model
        with the taxonomy as its instructions. What survives is entered into
        the register: hashed, bound to the entry before it, and never edited
        again. Each night the day's entries are sealed beneath a root record.
      </p>
      <p>
        Two standards of confidence apply throughout.{" "}
        <strong>CONFIRMED</strong> — corroborated by independent sources.{" "}
        <strong>CANDIDATE</strong> — reported, not yet corroborated. A
        candidate is promoted when a second independent source appears within
        thirty days.
      </p>

      <h3>When we are wrong</h3>
      <p>
        Entries are never deleted. A wrong entry is superseded by a new entry
        that names it, states the reason, and stays on the record beside it.
        The mistake, the correction, and the timing all remain public.
      </p>

      <h3>What certification proves</h3>
      <p>
        The <a href="/verify">certification console</a> recomputes every hash
        in your own browser. A pass proves no entry has been altered or
        reordered since its day was sealed. It does not prove our judgment
        was right, and it does not prove nothing was omitted — for those,
        read the sources we cite on every entry, and read our code, which is
        open in full.
      </p>

      <h3>The name</h3>
      <p>
        We call the persistent groupings <em>civilizations</em> with some
        care. Most files in this register record small things: a research
        demonstration, an incident, a marketplace finding its feet. We keep
        them anyway, because a civilization is only visible in retrospect —
        and the record has to begin before anyone is sure.
      </p>

      <div className="rule-double" />
      <p className="mono dim">
        SOURCE, TAXONOMY, AND CLASSIFIER PROMPT:{" "}
        <a href="https://github.com/spacecomputer/agentcivilizations">
          GITHUB.COM/SPACECOMPUTER/AGENTCIVILIZATIONS
        </a>{" "}
        · MIT LICENSE
      </p>
    </>
  );
}
