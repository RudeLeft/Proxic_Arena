# The attachment test deck

A legal 60-card Open Format deck for **attachments drawn with what
they modify** (PHASE_06 P6-AK).

```text
Attachment Test Deck.txt   12 Plains, 18 Mountain, 10 Forest
                           4 Raging Goblin, 4 Grizzly Bears
                           4 Bonesplitter, 4 Pacifism, 4 Rabbit Battery
```

The host casts Raging Goblins, equips Bonesplitter, reconfigures Rabbit
Battery onto a Goblin and puts Pacifism on the guest's creature; the
guest casts Grizzly Bears and nothing else, so it has something to be
pacified. The case that matters most is Pacifism: the host's Aura on
the guest's creature, which the board once drew nowhere at all.

Used by `frontend/e2e/match-attachments.spec.ts`. CI builds the package
with `scripts/make-ci-deck.mjs`. The worker-level check
(`scripts/check-attachments.py`) uses its own decks and adds Control
Magic.
