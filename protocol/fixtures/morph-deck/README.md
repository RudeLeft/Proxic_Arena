# The face-down test deck

A legal 60-card Open Format deck for **a face-down creature on the
board** (PHASE_06 §6.44, P6-I).

```text
Morph Test Deck.txt   44 Island
                      4 Willbender, 4 Echo Tracer, 4 Fathom Seer,
                      4 Stratus Dancer          (every one has morph)
```

The host casts one face down for {3}; the guest plays lands. The host's
board names its own card and says it is face down; the guest's shows a
"Face-down" creature with no name and no picture.

Used by `frontend/e2e/match-face-down.spec.ts`. CI builds the package
with `scripts/make-ci-deck.mjs`. The worker-level check
(`scripts/check-face-down.py`) also turns it face up and reads every
frame the opponent is sent.
