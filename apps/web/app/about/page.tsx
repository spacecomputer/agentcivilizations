// The methodology page — the one place warmth is permitted: the institution
// explaining its own rules, the way a good archive's reading-room guide does.
//
// Everything asserted here must be true of the code as it stands. When a
// rule changes, this page changes in the same commit, and AMENDED below
// moves with it. A register that dates its amendments cannot keep a
// methodology that quietly drifts.
export const metadata = { title: "Methodology" };

const AMENDED = "2026-09-07";
const REPO = "https://github.com/spacecomputer/agentcivilizations";

export default function AboutPage() {
  return (
    <>
      <span className="caps kicker">Reading-room guide</span>
      <h1>Methodology</h1>
      <p className="preamble">
        We keep a public record of a new kind of history: events in which AI
        agents coordinate, attack, and form persistent communities. We built
        the register so that you never have to trust us — only check us. This
        page is the account of how, including the places where checking us
        will not help and something else is needed instead. Journalists and
        researchers should start at <a href="/reference">the reference desk</a>,
        which covers citation, bulk data, and the two ways this record could
        mislead you.
      </p>
      <div className="rule-double" />

      <h3>What we enter</h3>
      <p>
        Four categories of event: <strong>coordination</strong> (agents
        cooperating, negotiating, specializing), <strong>security</strong>{" "}
        (agents as attacker, target, or instrument of an incident),{" "}
        <strong>community</strong> (persistent agent groupings with economies
        and protocols of their own), and <strong>speculative</strong> (signals
        that shift the near-future likelihood of the other three). The{" "}
        <a href={`${REPO}/blob/main/docs/TAXONOMY.md`}>full inclusion criteria</a>{" "}
        are public, and they are also the literal instructions given to our
        classifier — the editorial policy and the code are the same document.
        The same document says what we refuse: punditry, vendor marketing, and
        speculation with no stated mechanism.
      </p>

      <h3>How an entry is made</h3>
      <p>
        Every thirty minutes we pull thirty-four public feeds — research
        indexes, vulnerability databases, framework release notes, security
        reporting, and news queries, in English, Chinese and Russian —
        discard what we have seen before, and
        put the remainder to a language model with the taxonomy as its
        instructions. The models are free-tier and named in the code:{" "}
        <span className="mono">minimax-m3</span>,{" "}
        <span className="mono">glm-5.2</span>, and{" "}
        <span className="mono">nemotron-3-super</span>, tried in that order
        when one is unavailable. What survives is entered into the register:
        hashed, bound to the entry before it, and never edited again.
      </p>
      <p>
        Every entry stores the verbatim excerpt it was judged on, so you can
        see what the classifier saw. A model deciding what enters a public
        record is the weakest link in this system, and we would rather you
        knew which model, on what text.
      </p>

      <h3>What corroborated means</h3>
      <p>
        Two standards of confidence apply throughout.{" "}
        <strong>CONFIRMED</strong> — corroborated by independent sources.{" "}
        <strong>CANDIDATE</strong> — reported, not yet corroborated. The word
        doing the work there is <em>independent</em>, so here is the test we
        actually apply.
      </p>
      <p>
        Two sources corroborate only if they sit on different canonical
        domains and carry no identifier in common. We extract identifiers
        where they exist — a DOI, an arXiv number, a CVE, a commit hash, a
        Hacker News item — because two outlets running the same wire story,
        or two indexes listing one paper, are one report wearing two coats.
        Aggregators are ranked below the primaries they link to, and some are
        excluded from corroboration entirely. Fifty-nine domains carry an
        editorial tier, and that table is in the repository, not in anyone&apos;s
        head.
      </p>
      <p>
        Two state-affiliated outlets cannot corroborate each other: one
        state&apos;s outlets carrying one state&apos;s account is a single source in
        two mastheads. A state outlet paired with an independent one still
        counts, because that pairing carries information. An English and a
        Chinese source reporting the same event is the strongest pairing the
        register can get, since the two press ecosystems rarely share a wire.
      </p>
      <p>
        Confirmation can also arrive from a different file, when two entries
        name at least two of the same actors and share no identifier. A
        candidate is promoted when such a peer appears within thirty days,
        measured from when <em>we recorded</em> the peer rather than when the
        event occurred, because that is the clock we can prove.
      </p>

      <h3>How a day is sealed</h3>
      <p>
        Each night at 00:15 UTC the day&apos;s entries are sealed beneath a root
        record, and each root names the one before it. The root is then
        submitted to the public{" "}
        <a href="https://opentimestamps.org/" target="_blank" rel="noreferrer noopener">
          OpenTimestamps
        </a>{" "}
        calendars, which aggregate submissions into a Bitcoin transaction.
        Once Bitcoin confirms it, the proof carries a block header: evidence
        that our root existed no later than that block, which neither we nor
        the calendars can forge or withdraw.
      </p>
      <p>
        Days are sealed as a Merkle tree, so a single entry can be proved to
        belong to a sealed day using a short path of sibling hashes instead of
        the whole day; each entry page prints the length of its own path. Days sealed before the tree shipped keep their original
        flat root and their original anchor; a root is never recomputed under
        a newer method, and each root records which method sealed it.
      </p>

      <h3>How to check us</h3>
      <p>
        Three ways, in increasing order of independence from us. The{" "}
        <a href="/verify">certification console</a> recomputes every hash in
        your own browser. Every entry page will prove itself included in its
        sealed day, folding the sibling hashes back into the anchored root.
        And the verifier runs off our servers entirely:
      </p>
      <p className="mono">npx @agent-civilizations/verify --root=YYYY-MM-DD</p>
      <p>
        It reads public endpoints, declares no dependencies, needs no account
        or key, and exits non-zero if anything fails to reproduce. If it ever
        disagrees with this website, believe it and not us.
      </p>
      <p>
        A pass proves no entry has been altered or reordered since its day was
        sealed. It does not prove our judgment was right, and it does not
        prove nothing was omitted — for those, read the sources we cite on
        every entry, and read our code, which is open in full.
      </p>

      <h3>When we are wrong</h3>
      <p>
        Entries are never deleted. A wrong entry is superseded by a new entry
        that names it, gives a reason from a closed list — duplicate, source
        retracted, misclassified, or hoax — and stays on the record beside it.
        The retracted entry carries a notice forward to its correction. The
        mistake, the correction, and the timing all remain public, and the
        retraction is sealed and anchored exactly like the error it corrects.
        Only a maintainer can issue one, through an authenticated endpoint,
        and every attempt is logged.
      </p>

      <h3>Where files sit on the map</h3>
      <p>
        <a href="/survey">The Survey</a> places each file at the headquarters
        of its party of record: the organisation its entries name most, taking
        the first that can be located. This is the most inferential thing we
        publish and it is marked as such. A filled mark was placed from a
        curated entry or a Wikidata headquarters claim cited by its identifier;
        a hollow mark was a model&apos;s guess and is provisional. Almost all of
        them are filled, and almost all of those trace to a curated list
        rather than to a citation, which is a limit worth knowing before you
        read the map. Unplaced is a first-class outcome, shown and counted,
        never a blank.
      </p>
      <p>
        Only organisations place a file. People, author groups, publications,
        products and protocols are recorded and refused by a stated rule,
        because naming is not sponsorship and not blame: a file placed at a
        city is a file whose entries <em>name</em> an organisation seated
        there, as maker, target, or witness.
      </p>

      <h3>Two clocks</h3>
      <p>
        The register keeps time twice and never mixes them. Occurrence time is
        when an event happened, and it reaches back years. Record time is when
        we wrote it down, and it begins the day the register opened. A file is
        listed as dormant after ninety days without anything occurring in it,
        and ruled off after three hundred and sixty-five.
      </p>
      <p>
        This matters for any question about growth. Our sensitivity changed on
        the day the scanner switched on, so a curve drawn across that date
        reads as an explosion when much of it is simply us arriving. The{" "}
        <a href="/civilizations">catalog</a> draws that boundary into the plate
        rather than hiding it, and says plainly that it cannot tell you the
        proportion.
      </p>

      <h3>What we collect about you</h3>
      <p>
        This site loads Google Analytics, which sets its own cookies and
        reports page views to Google. It is the only third party the site
        talks to, it was added deliberately in September 2026, and we would
        rather say so here than have you find it in the network tab. Readers
        who send Do Not Track or Global Privacy Control are not measured, and
        the analytics path is skipped entirely for them.
      </p>
      <p>
        Nothing about a reader ever reaches the ledger. There are no accounts,
        nothing to log into, and no reader data in any entry, root, or file.
        Every check described above — the console, the inclusion proofs, the
        command-line verifier — works with analytics blocked.
      </p>

      <h3>What this record cannot tell you</h3>
      <p>
        The feeds skew toward what news covers, so the record is thinner where
        reporting is thinner, which is not the same as where events are
        rarer. They read English, Chinese and Russian and nothing else, and
        the non-English sources were added on 2026-09-08, so everything
        recorded before that date was found through English coverage alone.
        Entries carry the language of each source they cite. Most files rest on a single entry and
        remain candidates; a grouping with one uncorroborated report is a
        lead, not a finding. The map is shaped by our own hands more than by
        any inference: almost every placement traces to a list of
        organisations we curated, so a body absent from that list and absent
        from Wikidata goes unplaced, and roughly a third of files are
        unplaced today. And the register is young: it can show its coverage
        of eight years, but it cannot yet measure a trend, because it has run
        at a constant sensitivity for only a matter of days.
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
        AMENDED {AMENDED} ·{" "}
        <a href={`${REPO}/commits/main/apps/web/app/about/page.tsx`}>
          THIS PAGE&apos;S OWN HISTORY
        </a>
        <br />
        SOURCE, TAXONOMY, AND CLASSIFIER PROMPT:{" "}
        <a href={REPO}>GITHUB.COM/SPACECOMPUTER/AGENTCIVILIZATIONS</a> · MIT
        LICENSE
      </p>
    </>
  );
}
