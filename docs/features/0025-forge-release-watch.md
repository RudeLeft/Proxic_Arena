# 0025 — Forge release watch

**Status:** Approved 2026-10-27 — built
**Owner decisions** (2026-10-27): W1 a weekly check for a new Forge
release, as a report only; W2 the report includes the cards whose
printing changes what they do; no separate printing check (spec 0024
makes Forge the judge of those, and the list can only change when Forge
does); W3 build it.

## What the owner sees

Forge publishes 2.0.16. By the next Monday morning a GitHub issue appears
on Proxic Arena, titled "Forge forge-2.0.16 is out (we play forge-2.0.15)":

> **What moving to it would mean for us**
> - **New questions for players: 3** — `chooseSticker`,
>   `chooseStickerNamePosition`, `chooseCardToKeepStickers`. Each needs a
>   page (and a Mechanics Lab game) before we can move.
> - **Our Forge patches:** 0001 applies cleanly; 0002 no longer applies.
> - **New cards:** 312, in 2 new sets (`EOE`, `SPM`). 41 existing card
>   scripts changed.
> - **Cards whose printing changes what they do:** 24 → 27. New:
>   …, …, … (Attractions). With spec 0024 these stay strict
>   automatically once we move.
> - Release notes: link.

Nothing else happens. The site keeps playing 2.0.15 until the owner
decides to move, which is its own piece of work (AGENTS VEND-002,
VEND-005). The issue is opened once per release: next Monday, if it is
still open, it is left alone; a newer release gets its own issue.

When there is no new release, nothing is posted.

## Scope

In:
- **One workflow**, `.github/workflows/forge-watch.yml`: every Monday
  (and by hand from the Actions tab). It reads the latest release of
  `Card-Forge/forge` and compares it with `forge.release` in
  `forge-pin.properties`. Same or older: it stops.
- **The report**, made by `scripts/forge-release-report.py` from a
  sparse, blob-less fetch of the two Forge tags (only the paths it reads,
  not the whole repository):
  - **New player questions:** methods added to Forge's `PlayerController`
    between the tags, by name. These are the ones that matter most: each
    one is a question Arena would have to ask (the Phase 8 record,
    `forge-questions.tsv`, and `ForgeQuestionRecordTest` enforce that at
    build time once the pin moves; this tells us beforehand).
  - **Our patches:** whether each of `forge_patches/*.patch` still
    applies to the new tag (`git apply --check`).
  - **Cards and sets:** card scripts added and changed under
    `res/cardsfolder`, edition files added under `res/editions`.
  - **Cards whose printing changes what they do:** card scripts with
    `Variant:` lines that change more than the card's shown name, at
    each tag, and which ones are new. This is a text count, close to
    but not the same as what the worker asks Forge (spec 0024); the
    exact count is measured when the pin moves.
- **The issue**, with the GitHub CLI and the workflow's own token
  (`issues: write`, nothing else). If an issue with the same title
  already exists, open or closed, it does nothing.
- A test for the report script on two small hand-made Forge trees (a new
  question, a patch that no longer applies, a new variant card).

Out (and why):
- **Moving to the new Forge.** Never automatic: VEND-005 forbids a
  silent pin change, and a move means new pages, the patches and the
  Mechanics Lab run (Phase 0A evidence). The issue is where that
  decision starts.
- **Building the new Forge in the workflow.** Minutes of compiling every
  week for a number the text count already gives closely enough; the
  exact measure comes with the move.
- **A printing check between Forge releases.** With spec 0024, Forge says
  which cards' printings change them, Arena's deck rules carry that to the
  Deck Builder, and the Deck Builder follows. With the pin fixed nothing
  can change, so a weekly run would repeat the same answer.
- **Anything in the Deck Builder.** It removed its own Forge workflow
  (Arena spec 0021, R4); it learns about a Forge move through the deck
  rules, the moment Arena publishes them.
- **Forge's nightly or snapshot builds.** Releases only.

## Rules and boundaries

- **VEND-001/002/005:** nothing in Forge or the pin changes; the
  workflow only reads Forge's public repository and reports.
- No secrets beyond the workflow's own short-lived token, and it may only
  open issues.
- The report's wording follows the plain-English rule for the owner; the
  name "Forge" is fine here (admin/maintainer text, not player text).

## Tests

- **F-0025-A** (unit, the report script): on two hand-made trees it
  finds the new `PlayerController` method, the patch that no longer
  applies, the new card and set, and the new functional variant, and
  ignores a variant that only changes the card's name.
- **F-0025-B** (workflow, by hand): run once from the Actions tab with
  the comparison forced to an older tag (`forge-2.0.14` against
  `forge-2.0.15`) to see a real issue's wording; then closed.
- **F-0025-C:** with the pin equal to the latest release, a run posts
  nothing.
