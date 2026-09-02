// Actor identity helpers shared by ingestion (functions) and the web app.
//
// normalizeActor collapses classifier variance so "OpenAI project",
// "OpenAI Labs" and "openai" compare equal; actorSlug turns that into a
// stable document id for the actor registry.

const ROLE_SUFFIXES =
  /\s+(?:project|projects|team|teams|labs?|inc|llc|ltd|foundation|community|research|group|initiative)$/i;

export function normalizeActor(a: string): string {
  return a
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(ROLE_SUFFIXES, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function actorSlug(a: string): string {
  return normalizeActor(a).replace(/\s+/g, "-").slice(0, 80);
}
