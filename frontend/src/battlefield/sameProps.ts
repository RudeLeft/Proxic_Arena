// Spec 0095 -- props compared by what they hold, for React.memo: a change
// elsewhere on the board (a new board object with this card unchanged) does
// not redraw this part. Plain objects and arrays are compared by their
// contents, a few levels down; functions, elements and anything else by
// identity -- so a new callback each drawing still redraws (pass stable ones).

function same(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0 || typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i], depth - 1)) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const pa = Object.getPrototypeOf(a) as unknown;
  const pb = Object.getPrototypeOf(b) as unknown;
  // Only plain objects: a Map, a Set, a DOM node or a React element by identity.
  if (pa !== Object.prototype || pb !== Object.prototype) return false;
  if ("$$typeof" in a || "$$typeof" in b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth - 1))
      return false;
  }
  return true;
}

/**
 * Spec 0096 -- two keys of a drawing the same, by contents (as above, a level
 * deeper: a key holds the card, which holds its counters).
 */
export function sameContent(a: unknown, b: unknown): boolean {
  return same(a, b, 6);
}

/** React.memo's compare: every prop the same, by contents (see above). */
export function sameProps<P extends object>(a: Readonly<P>, b: Readonly<P>): boolean {
  return same(a, b, 5);
}
