// Actor identity helpers shared by ingestion (functions) and the web app.
//
// normalizeActor collapses classifier variance so "OpenAI project",
// "OpenAI Labs" and "openai" compare equal; actorSlug turns that into a
// stable document id for the actor registry.

const ROLE_SUFFIXES =
  /\s+(?:project|projects|team|teams|labs?|inc|llc|ltd|foundation|community|research|group|initiative)$/i;

// The character class is Unicode-aware on purpose. Written as [^\w\s-]
// it means [^A-Za-z0-9_\s-], which silently deletes every Chinese and
// Cyrillic name it is given: 阿里巴巴 and Сбербанк both normalised to the
// empty string, so a non-Latin actor was discarded before it could reach
// the registry, the ties plate, or the origins map — and corroboration,
// which keys on shared actors, could never fire across languages. The
// class below is byte-identical for ASCII input, so no existing slug moves.
export function normalizeActor(a: string): string {
  return a
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, "")
    .replace(ROLE_SUFFIXES, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function actorSlug(a: string): string {
  return normalizeActor(a).replace(/\s+/g, "-").slice(0, 80);
}
