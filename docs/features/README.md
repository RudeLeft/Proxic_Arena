# Feature specs

Since 1.0.0 (2026-10-22) new work is one feature at a time, each with a
short spec here. **An owner-approved spec is what a locked phase used to
be**: work starts only on an approved spec (AGENTS PHASE-001), and
changing an approved spec is an explicit, dated, owner-approved
amendment (PHASE-002). A big feature simply has a longer spec.

Name: `NNNN-short-name.md`, numbered in order (`0001-sacrifice-question.md`).
List every spec in `ROADMAP.md`, with its status.

## Template

```markdown
# NNNN — <Feature name>

**Status:** Draft | Approved YYYY-MM-DD | Built in <version> | Dropped
**Owner decisions:** none yet

## What the player sees
A game example: "Your opponent casts Diabolic Edict; you are asked which
creature to sacrifice, and only your creatures are offered."

## Scope
In: …
Out (and why): …

## Rules and boundaries
Which AGENTS rules this touches (hidden information, Forge as upstream,
no rules workarounds, …), and how the design keeps them.

## Acceptance tests
| ID | Test | Evidence it needs (unit / real game / browser / owner) |
|---|---|---|
| F-NNNN-A | … | … |

## Decisions for the owner
Each in plain words, with a game example and a recommendation.

## Amendments
Dated, owner-approved changes after approval.
```
