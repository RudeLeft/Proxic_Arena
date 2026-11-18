// Spec 0100 (owner 2026-11-17, deep dive 3, canvas "deep3-round2-1117") --
// what a spell's caster chose, drawn on the spell itself.
//
// Round 2 Q1 B: the X paid is a gold round medallion, "X=6", on the card's
// top-right corner -- popped on the casting card, flown with it to the stack
// (CastingFlight), and kept on the stack card at 0.8 size until the spell
// leaves. Round 2 Q2 B: a modal spell's body shows every mode as the card
// prints them, one line each, the chosen ones lit gold, the rest grey and
// struck through. Long modes are shortened on the card (two lines at most);
// the close-up has the full words.

/** Round 2 Q1 B -- the X medallion on the stack card (0.8 the size it had on the casting card). */
export function XMedallion({ x }: { x: number }) {
  return (
    <span className="bf-xmed" data-x={x} role="img" aria-label={`X is ${x}`}>
      X={x}
    </span>
  );
}

/** Round 2 Q2 B -- every mode, the chosen lit, the rest struck through. */
export function ModeLines({ modes }: { modes: readonly { text: string; chosen: boolean }[] }) {
  return (
    <span className="bf-modes" data-modes={modes.length} aria-hidden="true">
      {modes.map((mode, i) => (
        <span
          key={i}
          className={`bf-mode${mode.chosen ? " bf-mode-on" : " bf-mode-off"}`}
          data-mode={mode.chosen ? "chosen" : "not-chosen"}
        >
          <i className="bf-mode-gem" />
          <span className="bf-mode-text">{mode.text}</span>
        </span>
      ))}
    </span>
  );
}

/** The close-up's words for the extra costs (spec 0100, item 3): "Kicked", "Overloaded"... */
export function extraWords(extra: readonly string[] | undefined, kicks?: number): string[] {
  const words: Record<string, string> = {
    kicked: kicks && kicks > 1 ? `Kicked ${kicks} times` : "Kicked",
    overloaded: "Overloaded",
    evoked: "Evoked",
    entwined: "Entwined",
    escalated: "Escalated",
  };
  return (extra ?? []).map((e) => words[e] ?? e);
}
