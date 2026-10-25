// Choosing a deck's icon — spec 0012 (owner 2026-10-25).
//
// The ten sheets as tabs, ten icons each; the current choice (or the
// suggestion from the deck's colours) starts selected. Inline in the
// deck view, not a pop-up: it opens under the deck's name.

import { useId, useState } from "react";
import { DeckIcon, ICON_SHEETS, iconWords } from "./deckIcons";

export function DeckIconPicker({
  title,
  current,
  suggested,
  busy,
  problem,
  onUse,
  onCancel,
  cancelLabel,
}: {
  title: string;
  /** The icon selected when the picker opens. */
  current: string;
  /** Marked "Suggested" wherever it appears. */
  suggested: string;
  busy: boolean;
  problem: string | null;
  onUse: (icon: string) => void;
  onCancel: () => void;
  cancelLabel: string;
}) {
  const headingId = useId();
  const [picked, setPicked] = useState(current);
  const [sheet, setSheet] = useState(() =>
    Math.max(
      0,
      ICON_SHEETS.findIndex((s) => s.icons.includes(current)),
    ),
  );

  return (
    <div className="pa-icon-picker" role="group" aria-labelledby={headingId}>
      <div className="pa-icon-picker-head">
        <h4 id={headingId}>{title}</h4>
        <span className="pa-icon-picker-chosen">{iconWords(picked)}</span>
      </div>
      <div className="pa-icon-sheets" role="tablist" aria-label="Icon sheets">
        {ICON_SHEETS.map((s, index) => (
          <button
            key={s.name}
            type="button"
            role="tab"
            aria-selected={index === sheet}
            className="pa-icon-sheet"
            onClick={() => setSheet(index)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="pa-icon-grid" role="tabpanel" aria-label={ICON_SHEETS[sheet]?.name}>
        {ICON_SHEETS[sheet]?.icons.map((name) => (
          <button
            key={name}
            type="button"
            className="pa-icon-choice"
            aria-pressed={name === picked}
            aria-label={name === suggested ? `${iconWords(name)} (suggested)` : iconWords(name)}
            title={iconWords(name)}
            onClick={() => setPicked(name)}
          >
            <DeckIcon name={name} size={72} />
            {name === suggested && <span className="pa-icon-suggested">Suggested</span>}
          </button>
        ))}
      </div>
      {problem && (
        <p className="pa-field-problem" role="alert">
          {problem}
        </p>
      )}
      <div className="pa-button-row">
        <button
          type="button"
          className="pa-button pa-button-brass"
          disabled={busy}
          onClick={() => onUse(picked)}
        >
          {busy ? "Saving…" : "Use this icon"}
        </button>
        <button type="button" className="pa-button pa-button-quiet" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
