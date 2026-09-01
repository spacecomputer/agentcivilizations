# The Iron Register — design specification

**Status:** Adopted 2026-08-31 · panel verdict 3–0
**Scope:** The complete visual identity and interface system for AgentCivilizations.org.

This direction was selected by a design panel: four independent studio pitches (observatory / chronicle / signal / atlas lenses), scored by three judges (brand strategy, typography & accessibility, front-end engineering). *The Iron Register* — the chronicle direction — won unanimously. The judges' required fixes and grafts from the runner-up pitches are folded into this document; see [Amendments](#amendments) for the list.

---

## 1. Thesis

AgentCivilizations.org is not a news site that happens to be trustworthy — **it is a registry that happens to be current.** Every screen is a page of an institutional ledger: ruled hairlines instead of cards, a margin rail carrying sequence numbers the way a chancery roll carries its foliation, iron-gall ink on cool stone-white paper — and the same ink world inverted at night.

The mapping to the data model is 1:1, which is what gives the identity fifty-year legs:

| Ledger convention | Our data model |
|---|---|
| Foliation (numbered leaves) | `seq` |
| Stitching between membranes | `prevHash` |
| The chancellor's seal | daily root record |
| Ruling a file closed | civilization `extinct` |
| A penciled entry awaiting ink | `candidate` confidence |

Gravity comes from ruled austerity and the registrar's voice. Urgency comes from the fact that the ledger visibly grows — today's root record sits at the top, still open, timestamped to the minute.

**World reference:** chancery enrollments, court record books, national-archive finding aids, monumental epigraphy's letterspaced capitals — rendered in flat modern CSS. Zero parchment texture, zero skeuomorphism, no faux-Trajan. These are the only visual languages humans ever built specifically to make records feel *binding*: the ruled line that prevents insertion between entries, the sequential folio number that makes omission detectable, the seal that certifies.

**The signature gesture — hash as masthead.** The largest typographic element on the homepage is a raw 64-character SHA-256 hash, set in monospace with the reverence other institutions give their crest. It is the only honest crest this institution could have: the hash is literally the seal that makes the record binding. Everything else in the identity exists to make that gesture read as ceremony rather than error.

---

## 2. Color

All values are design tokens (CSS custom properties). Contrast ratios below were independently re-measured by the review panel; every category ink is ≥ 7.0:1 (light) and ≥ 8.0:1 (dark) as text on its ground.

### Light — "the reading room"

| Token | Name | Hex | Role |
|---|---|---|---|
| `--ground` | Stone White | `#F5F6F2` | Page ground — cool archival paper, no cream warmth |
| `--surface` | Ledger White | `#FCFCFA` | Raised surface: provenance panels, verify console, root rows |
| `--ink` | Iron Gall | `#1B2430` | Primary text and structural rules (14.4:1) |
| `--ink-dim` | Faded Ink | `#4C5661` | Secondary text: dates, domains, annotations (6.9:1) |
| `--rule` | Rule Hairline | `#C9CDC7` | 1px ledger rules only — never carries meaning alone |
| `--cat-coordination` | Chancery Blue | `#24518F` | Coordination ink; also links & institutional accent (7.2:1) |
| `--cat-security` | Oxide Red | `#8C3527` | Security ink (7.4:1) |
| `--cat-community` | Verdigris | `#1F5E42` | Community ink; doubles as chain-intact certification (6.6:1) |
| `--cat-speculative` | Archive Violet | `#55408C` | Speculative ink (7.7:1) |
| `--seal` | Seal Bronze | `#6E5310` | Daily roots ONLY — the seal never competes with categories |
| `--fail` | Discrepancy | `#A02C1C` | Failure emphasis surfaces only |

### Dark — "the vault"

| Token | Name | Hex | Role |
|---|---|---|---|
| `--ground` | Night Slate | `#10151D` | Deep blue-slate, never pure black, no neon anywhere |
| `--surface` | Vault Slate | `#1A212C` | Raised surfaces |
| `--ink` | Paper Ink | `#E9EBE4` | The paper color becomes the ink (14.6:1) |
| `--ink-dim` | Dim Ink | `#9AA3AD` | Secondary text (7.0:1) |
| `--rule` | Rule Dark | `#2C3542` | 1px rules |
| `--cat-coordination` | Chancery Blue | `#8FB4E8` | (8.3:1) |
| `--cat-security` | Oxide Red | `#E39A82` | (8.0:1) |
| `--cat-community` | Verdigris | `#8CC9A8` | (9.4:1) |
| `--cat-speculative` | Archive Violet | `#B9A6E3` | (7.6:1) |
| `--seal` | Seal Bronze | `#D4B45A` | (9.1:1) |
| `--fail` | Discrepancy | `#ED8A6B` | On Vault Slate: 6.5:1 |

### Color rules

1. **Red means exactly one thing.** Oxide is the security category ink; the `--fail` emphasis variant appears only on failure surfaces and always pairs with the words `CERTIFICATION FAILED` / `DISCREPANCY`. No other red exists.
2. **Bronze is reserved.** `--seal` appears only on daily root rows and the root stamp.
3. **Hue is never the sole channel.** Category is triple-encoded: ink color + letterspaced caps label + rail glyph (§7). The caps label is a *required* prop of every category-bearing component — a build that omits it is wrong.
4. **Opacity is for decorative rules only.** Text is never dimmed with `opacity`; de-emphasis always moves to the `--ink-dim` token (which is contrast-verified). This rule exists because a 35%-opacity row measures ~1.5:1 and reads as broken UI.
5. **Measure, don't assert.** Any new token or derived value (hover states, tints) gets a computed contrast check before merge. The palette's headroom (all inks ≥ 6.5:1) exists so variants survive — but only if someone keeps measuring.

### Theme plumbing

Light is the `:root` default. Dark redefines tokens twice — once under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`, once under `:root[data-theme="dark"]` — so an explicit user choice beats the OS in both directions. Components style through tokens only; no color literal ever appears inside a media or `[data-theme]` block. `body` sets `background: var(--ground)` explicitly.

---

## 3. Typography

Three faces, three registers, total discipline:

| Role | Face | Usage |
|---|---|---|
| **The institution's voice** | **Archivo** (variable; `wdth` to Expanded, `wght` 500–800) | Masthead, stamps, statuses, caps labels, event titles (600, sentence case) |
| **The historical prose** | **Literata** (variable, `opsz`; 400/400i/600) | Summaries, civilization prose, methodology |
| **The machine-attested layer** | **IBM Plex Mono** (400/500) | Hashes, seq, timestamps, verify readouts — everything a machine wrote |

**Rationale.** Archivo was drawn for archival headline setting; at Expanded width, 700–800 weight, all-caps with +6–8% letterspacing it becomes modern epigraphy — incised-capital authority without a single faux-Roman serif. Literata is a book face commissioned for digital long-form reading: printed-chronicle gravity, no parchment kitsch. IBM Plex Mono carries institutional (not hacker) temperament with clear 0/O and 1/l distinction. All three are Google Fonts; neither primary is Inter or Space Grotesk.

**Loading.** The `wdth` axis must be requested explicitly or Expanded silently becomes normal-width:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..800&family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..700&family=IBM+Plex+Mono:wght@400;500&display=swap">
```

Fallbacks: Archivo → `'Helvetica Neue', Arial, sans-serif` (no width axis exists in the fallback — letterspacing is set so caps still read institutionally un-expanded); Literata → `Georgia, 'Times New Roman', serif`; Plex Mono → `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`.

**Scale.** Major third (1.250) from a 17px Literata base, line-height 1.6: `17 / 21 / 27 / 34 / 42 / 53`. Caps labels at **12px minimum** (raised from the pitched 11px per panel review), 0.08em tracking. Masthead wordmark: Archivo Expanded 800, `clamp(28px, 4vw, 42px)`, 0.06em tracking. Hero hash: Plex Mono 500, `clamp(18px, 2.6vw, 30px)`. Body measure capped at 68ch. `tabular-nums` wherever digits align. Record numbers are written `No. 12,847` — not `№`, whose glyph coverage across the three faces is unverified and a fallback-font glyph in the crest is a brand wound.

---

## 4. Layout — the register grid

- 12-column grid, 1264px max width, **flush left**. Nothing is centered except numerals inside their own rail.
- **Margin rail** (fixed 88px, desktop): a continuous 1px vertical rule carrying seq numbers, dates, and root-seal marks in mono, right-aligned — the ruled margin column of a ledger page.
- Content in columns 2–9 (max 68ch); right sidebar (10–12) holds filters, cross-references, chain-state summary.
- **Rule cadence:** 1px hairline between feed rows; **double-thin rule** (two 1px lines, 3px apart — the classic ledger section closure) between sections; bronze root row at each day boundary.
- **No cards. No drop shadows. No rounded containers.** Elevation is expressed only by surface-token shifts and rules. `border-radius: 0` everywhere except 2px on interactive controls.
- Spacing: 8px base; section breathing at 64/96px.
- **Mobile (≤ 720px):** the rail is dropped entirely (never shrunk); seq + date render as a mono prefix line above each title. The double-thin section rules and the masthead chain-state ticker survive to mobile — they are the identity at small sizes. Snapshot-test at 320px.

**Masthead (persistent):** wordmark left; chain-state ticker right — `No. 12,847 · CHAIN INTACT · VERIFIED 14:32 UTC`. Footer is a colophon set like an imprint page: build hash, data license, methodology link.

---

## 5. The homepage — hash as masthead

No marketing hero, no illustration, no tagline-over-gradient. The page opens with the ledger's current state, set like the title page of an enrolled record:

1. Archivo Expanded caps, small: `THE PUBLIC RECORD OF THE AGENT ERA`
2. **The crest:** the latest root hash (or latest `contentHash` before sealing) — full 64 characters, Plex Mono, the largest element on the page, chunked in 8-character groups via `word-spacing` (copy control preserves the raw string). Below ~480px: render 4 groups + an expand control, never a 4-line wall.
3. **The attestation line**, mono, directly beneath: `RECORD No. 12,847 · 4 CIVILIZATIONS ACTIVE · DAY 312 · CHAIN INTACT ✓ (verified in this browser, 2.1s)` with *verify again* as a text link. The ✓ is an inline SVG glyph, not a unicode character.
4. One Literata paragraph, two sentences, stating what the institution is.
5. **The activity strip** (grafted from the observatory pitch): a static inline SVG built at export time — the last 90 days as spikes colored by category ink, daily roots as bronze ticks, each day a link target. Homepage only; never chrome. This supplies the "happening today" pulse the register otherwise lacks.
6. The register begins — today's open day at the top.

**The hash and attestation line are one indivisible component** — a single flex container that cannot reflow apart at any viewport. Their separation is the homepage's named failure mode.

**Verification is earned, not asserted.** The intact mark is never pre-rendered into static HTML. On load, verification of a bounded window (latest sealed day + open day) runs via `requestIdleCallback` with chunked Web Crypto; until it completes the slot shows `verifying…` in Dim Ink. The full chain remains `/verify`'s job.

---

## 6. Components

### Event row (the register row)
Rail: seq (mono, right-aligned) + time. Body: title in Archivo 600 sentence case → two-sentence Literata summary → one metadata line in mono/caps: category label in its ink with a 2px solid underline tick (**never a pill, never a rounded badge**), confidence mark, citation-style cross-reference (`→ CIV-0007 · Silverstream`).

- **Confirmed:** filled 8px square rail marker, solid hairline, full-strength ink.
- **Candidate:** hollow marker, *dashed* row rule, metadata at `--ink-dim`, always-visible `CANDIDATE` caps label. **The title stays at full ink** — a penciled entry is provisional, not disabled.

### Daily root row (the seal)
Full-width row on the raised surface token: bronze stamp glyph (inline SVG circled chain mark), `ROOT RECORD — 2026-08-30 · 14 EVENTS SEALED` in letterspaced bronze caps, root hash in mono beneath a double-thin rule. Scrolling the feed reads as leafing back through sealed days.

### Civilization page (the fonds)
Finding-aid header: call number `CIV-0007` in mono; name in the page's largest Archivo; ruled metadata table (`FILE OPENED / LAST ENTRY`, event count, category distribution as a 4px stacked bar). Status is a **stamp**, not a badge:

- `ACTIVE` — solid caps inside a 1.5px rectangular rule
- `DORMANT` — hollow (outlined) caps, dashed rule
- `EXTINCT` — solid caps with a closing rule beneath and `FILE CLOSED 2026-06-14` — the register ruled off

The thread runs down a continuous 2px spine on the rail; each event a node (filled/hollow by confidence, colored by category). Gaps are honest: > 14 days compresses to a dashed spine segment annotated `no entries · 41 days`.

**Civilization seal (grafted from the atlas pitch):** each civilization owns a small deterministic inline-SVG mark generated from its ID hash (hash nibbles → radial strokes/ring pattern, drawn in its category ink) — a memorable crest in the index and page header, trivially cheap, no assets.

### Index page
A catalog table, one civilization per ruled row: call number, name, status stamp, cadence sparkline (inline SVG ink ticks), first/last dates. Sorted by last entry — the register privileges what is still being written.

### Filters
Ruled checklists in the sidebar. Filtering never rearranges and never dims with opacity: non-matching rows restyle to the `--ink-dim` token with thinned markers, plus a `hide filtered (14)` toggle.

### Pagination
**Infinite scroll is forbidden.** The feed paginates by day-range addresses with mono prev/next controls — a permanent record has addresses, not a bottomless stream. Day-range pages are also exactly what a static export can pre-render.

---

## 7. Category & confidence encoding

A 4 × 2 matrix — four inks × two textures — that survives grayscale printing and every class of color-vision deficiency:

| Category | Ink (light / dark) | Rail glyph |
|---|---|---|
| coordination | `#24518F` / `#8FB4E8` | triangle |
| security | `#8C3527` / `#E39A82` | hachure (diagonal strokes) |
| community | `#1F5E42` / `#8CC9A8` | dot cluster |
| speculative | `#55408C` / `#B9A6E3` | dash |

| Confidence | Treatment |
|---|---|
| confirmed | filled glyph · solid rules · full ink |
| candidate | hollow glyph · dashed rule · dim metadata · visible `CANDIDATE` label |

Standing definitions, repeated verbatim wherever the terms appear:
> **CONFIRMED** — corroborated by independent sources.
> **CANDIDATE** — reported, not yet corroborated.

---

## 8. The verify ritual

`/verify` is staged as **certification, not a feature demo.**

1. Literata preamble in the registrar's voice: what will be computed, by whom (your browser, Web Crypto, no server), what a pass proves.
2. One control: rectangular 2px-ruled button, Archivo caps — `CERTIFY THE RECORD`.
3. The certification console: **one row per day** (not per record — 312 days at ~24ms/row certifies in visible seconds), each showing date, event count, recomputed root hash, verdict mark. A per-record tabular counter runs beneath (`No. 1 … No. 12,847`) like a mechanical counter. Web Crypto chunked ~50 records per frame so the main thread stays live.
4. **Pass:** the console rules itself off with a double-thin line and prints an attestation block in ruled Archivo caps + mono: `CHAIN INTACT — 12,847 RECORDS, 312 ROOTS, RECOMPUTED IN THIS BROWSER IN 8.4s · 2026-08-31 14:32 UTC`, terminal hash in Verdigris, copyable attestation string.
5. **Fail:** an Oxide discrepancy report — `CERTIFICATION FAILED — FIRST DISCREPANCY AT No. 4,112`, offending record linked, expected vs computed hashes diffed character-by-character.

Event pages carry a one-record miniature of the ritual in their provenance panel: `contentHash`, `prevHash` (linked to the prior record), and a `recompute` control with the same pass/fail marks.

`prefers-reduced-motion`: the console skips the ticking and renders the finished attestation instantly.

---

## 9. Motion

**An archive does not animate; it registers.** Motion exists only where it evidences a real process, every duration under 250ms except the verification tick. The full inventory, each with its named static substitute:

| Motion | Duration | Reduced-motion substitute |
|---|---|---|
| Verify console row ticking + counter | ~24ms/day row | instant finished attestation |
| Link/control hover: underline 1px → 2px | 120ms | thicker underline, no transition |
| Masthead ticker timestamp crossfade | 150ms | instant swap |
| Focus states | **instant, never animated** | (same) |

Banned: parallax, scroll-triggered reveals, skeleton shimmer (loading states are faded-ink mono text: `retrieving the record…`), and any simulated liveness — a static export pushes nothing, so nothing may pretend data arrived. The "entry committed" row animation from the original pitch is cut unless real client-side polling drives it.

---

## 10. Voice & copy

The registrar's voice: declarative, numbered, unhurried. Zero exclamation marks; zero hype vocabulary in chrome copy — the events supply their own weight.

| Surface | Copy |
|---|---|
| Buttons | `Certify the record` · `Open the file` · `Consult sources` · `Copy attestation` |
| Empty states | `No events entered for this day.` · `This file is open. No entries yet.` |
| Errors | `The record could not be retrieved. The chain is unaffected.` |
| Failure | `Certification failed — first discrepancy at No. 4,112.` |
| Candidate note | `This entry is provisional and has not met the confirmation standard.` |
| Cross-references | `See CIV-0007, entries No. 3,201–3,240.` |

Timestamps: always UTC, always mono. The only permitted warmth is the methodology page — first-person-plural Literata prose, the institution explaining its own rules like a reading-room guide.

---

## 11. Accessibility (load-bearing, not aspirational)

- WCAG AA minimum on every text token in both themes; measured, not asserted (see §2 rule 5).
- Category never encoded by hue alone — ink + caps label + glyph, and the label is required in the component API.
- Confidence never encoded by hue at all — texture and weight.
- Focus: 2px Chancery Blue outline, 2px offset, visible on every interactive element on both grounds, never animated.
- `prefers-reduced-motion` yields a fully equivalent motionless site (§9 table).
- Text is never opacity-dimmed.
- Caps labels never below 12px.

---

## <a name="amendments"></a>12. Amendments entered by the review panel

Grafts from the non-winning pitches, all incorporated above:

| From | Graft |
|---|---|
| The Pen Recorder (signal) | 8-char hash chunking · day-address pagination, no infinite scroll · "red means one thing" scoping · candidate title stays full ink |
| First Light Station (observatory) | homepage 90-day activity strip (build-time SVG, homepage only) · idle-deferred chunked Web Crypto · reduced-motion equivalence inventory |
| The Standing Survey (atlas) | four category rail glyphs as a third channel · verbatim confidence definitions · deterministic civilization seals |

Fixes required in the winner, all incorporated above: opacity-dimming killed (§2, §6) · hash+attestation indivisible with mobile chunking strategy (§5) · verification earned client-side, never pre-rendered (§5) · verify console rows are days, chunked crypto (§8) · caps floor raised to 12px (§3) · `wdth` axis requested explicitly with un-expanded fallback plan (§3) · `№` replaced by `No.` (§3) · "entry committed" animation cut (§9) · mobile rail spec (§4) · category label required in component API (§7, §11) · contrast checked in CI (§2).

## 13. Directions considered and not chosen

For the record — the register keeps its deliberations too:

- **First Light Station** (observatory lens): the site as humanity's recording instrument — seismograph-drum homepage, glass-plate-archive palette, Spectral/Public Sans. Judges: 2nd place; strongest "alive" quality, but the instrument chrome carried maintenance liability and the identity leaned on animation a static export can't honestly drive. Its best organ — the activity strip — was grafted.
- **The Pen Recorder** (signal lens): strip-chart editorial design, data-desk rigor. Judges: 3rd; superb engineering spec (much of it grafted), but the weakest distinct identity of the four.
- **The Standing Survey** (atlas lens): civilizations as surveyed territories, expedition-ledger conventions. Judges: 4th; the most visually ambitious and the least implementable (Canvas contour cartograms, per-breakpoint bespoke SVG) — its deterministic marks and honest-gap conventions were grafted.
