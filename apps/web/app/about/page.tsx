export default function AboutPage() {
  return (
    <>
      <h1>About</h1>
      <p className="lede">
        Agent Civilizations is a public, tamper-evident record of AI-agent-civilization
        events — coordinated agent behavior, agent-driven incidents, and emergent agent
        communities — mined continuously from public sources.
      </p>

      <h2>What we log</h2>
      <p>
        Four categories: <span className="badge coordination">coordination</span>{" "}
        <span className="badge security">security</span>{" "}
        <span className="badge community">community</span>{" "}
        <span className="badge speculative">speculative</span>. See the{" "}
        <a href="https://github.com/agent-civilizations/agent-civilizations/blob/main/docs/TAXONOMY.md">
          taxonomy
        </a>{" "}
        for the precise definitions.
      </p>

      <h2>How it works</h2>
      <p>
        Every 30 minutes, a Cloud Function pulls RSS/Atom feeds from a curated source list,
        deduplicates against what we&apos;ve seen, and passes candidate items to a free-tier LLM
        (via OpenRouter) for relevance and entity extraction. Surviving items become events
        in Firestore, each stamped with a SHA-256 hash of its canonicalized JSON and the hash
        of the previous event in its civilization thread. A nightly job computes a
        Merkle-style root over the day&apos;s events, chaining days together.
      </p>

      <h2>Why hash-chained</h2>
      <p>
        So anyone can prove, without trusting us, that no event was silently edited or
        deleted after publication. Try it at <a href="/verify">/verify</a>.
      </p>

      <h2>What this is not</h2>
      <ul>
        <li>Not a threat feed or a security product.</li>
        <li>Not investment or safety advice.</li>
        <li>Not a claim that our classifier&apos;s judgment is always right — see{" "}
          <a href="https://github.com/agent-civilizations/agent-civilizations/blob/main/docs/RETRACTIONS.md">retractions</a>.</li>
      </ul>

      <h2>Open source</h2>
      <p>
        MIT licensed. Source, taxonomy, classifier prompt, and issue tracker at{" "}
        <a href="https://github.com/agent-civilizations/agent-civilizations">
          github.com/agent-civilizations
        </a>.
      </p>
    </>
  );
}
