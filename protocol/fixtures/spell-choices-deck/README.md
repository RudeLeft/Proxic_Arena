# The spell-choices test deck

A legal 60-card Open Format deck for spec 0100's real-click game
(F-0100-G): divided damage at a creature and a player, a spell's target
changed by Spellskite, and a spell aimed at a card in a graveyard.

```text
Spell Choices Test Deck.txt   24 Mountain, 16 Swamp
                              4 Gray Ogre: a creature on each side
                              4 Arc Lightning: 3 damage split 2 / 1
                                between the host's Ogre and the host
                              4 Lightning Bolt: the host's, at the
                                guest's Ogre
                              4 Spellskite: the guest really clicks it
                                to take the Bolt
                              4 Reanimate: the guest's, at the host's
                                Ogre in the host's graveyard
```

Both seats bring it; spec 0098's test deal gives each the cards for its
half. Used by `frontend/e2e/match-spell-choices.spec.ts`. CI builds the
package; locally:

```text
node scripts/make-ci-deck.mjs "Test Deck/spell-choices-deck.zip" protocol/fixtures/spell-choices-deck
```
