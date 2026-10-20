# The control-another-player test deck

A legal 60-card Open Format deck that exists to put one player in
charge of another (PHASE_06 §6.37, §6.38, P6-U).

```text
Mindslaver Test Deck.txt   56 Mountain
                           4 Mindslaver   {6}; {4}, {T}, sacrifice:
                                          control target player during
                                          their next turn
```

The host mulligans until Mindslaver is in hand, casts it at six
lands and uses it the next turn on the guest. During the guest's
next turn the HOST's page is asked the guest's questions ("Playing
for seat 2") and sees the guest's hand; the guest's page is asked
nothing.

Used by `frontend/e2e/match-mindslaver.spec.ts`; the worker-level
check (`scripts/check-mindslaver.py`) uses its own non-legal deck.
