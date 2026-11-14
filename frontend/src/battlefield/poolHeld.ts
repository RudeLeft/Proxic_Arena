// Spec 0086 (11 A) -- mana on its way into a pool. The board the game sends
// already holds the new mana, but each mana flies in as a ball from where it
// was made: until a ball lands, the pool's chip shows the count less what is
// still flying (the count steps up one per ball). A view of the board, never
// a second count (ARCH-003): with nothing flying it is the board's number.

import { useSyncExternalStore } from "react";

const held = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => {
  version++;
  listeners.forEach((listener) => listener());
};

/** "seat:colour" -- one pool chip. */
export const poolKey = (seat: number, colour: string) => `${seat}:${colour}`;

/** [n] more mana of [key] are flying in. */
export function holdPool(key: string, n: number): void {
  if (n <= 0) return;
  held.set(key, (held.get(key) ?? 0) + n);
  notify();
}

/** [n] of [key]'s mana landed (or will never fly). */
export function releasePool(key: string, n: number): void {
  const now = (held.get(key) ?? 0) - n;
  if (now > 0) held.set(key, now);
  else held.delete(key);
  notify();
}

/** Everything lands at once (the board went, a new game). */
export function releaseAllPools(): void {
  if (held.size === 0) return;
  held.clear();
  notify();
}

/** How many of [key]'s mana are still flying in. */
export function heldPool(key: string): number {
  return held.get(key) ?? 0;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Redraws when anything held changes; read with heldPool. */
export function usePoolHeld(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}
