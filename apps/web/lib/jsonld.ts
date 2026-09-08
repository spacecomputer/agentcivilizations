// One helper, used at every <script type="application/ld+json"> on the site.
//
// JSON.stringify does not escape "<". Every title and summary in the register
// is written by a language model from text the register fetched off the open
// web, and every source URL is stored as the feed gave it — so a single
// "</script>" anywhere in that pipeline would close the JSON-LD block early
// and put whatever followed into the document as markup. Nothing in the 2,082
// blocks shipping today carries a raw "<", which is luck, not a control.
//
// Escaping as \u00xx is still valid JSON, parses to the identical object, and
// makes the string unable to terminate the element that contains it. U+2028
// and U+2029 go too: both are legal inside a JSON string and illegal in
// JavaScript source, which breaks some consumers outright.
export function jsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
