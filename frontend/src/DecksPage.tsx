// The Deck Depot — PHASE_07 §7.65 and Amendment 10, over Phase 4; spec 0008.
//
// The canvas's Depot: import on the left with the library under it,
// the open deck on the right with who holds it and its cards. Still
// not a deck builder (§2.87): decks are made in Proxic Deck Builder
// and arrive here as packages. Spec 0008 adds a card's close-up (click
// it), a card size and the phone fixes.
//
// Everything a player may do here the server decides again: hiding
// Rename, Delete and Share on a deck lent to you is the courtesy, the
// refusal is the protection (§4.71, §4.80).

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  bandsOf,
  deleteDeck,
  getDeck,
  headingFor,
  importDeck,
  listDecks,
  listShares,
  renameDeck,
  revokeShare,
  setDeckIcon,
  shareDeck,
  type DeckDetail,
  type DeckEntryView,
  type DeckLibrary,
  type DeckSummary,
  type ImportFailure,
  type ImportedDeck,
  type ShareList,
} from "./decks";
import { CardZoom } from "./CardZoom";
import { DeckIcon, iconOf, suggestedIcon } from "./deckIcons";
import { DeckIconPicker } from "./DeckIconPicker";
import { Avatar } from "./avatars";
import { avatarOf } from "./lobbyView";
import { useLobbyConnection } from "./shell/LobbyConnection";

type ImportView =
  | { kind: "idle" }
  | { kind: "working"; fileName: string }
  | { kind: "imported"; deck: ImportedDeck }
  | { kind: "failed"; failure: ImportFailure; file: File };

/** §2.85 — what was actually imported, in one sentence. */
function importedSentence(deck: ImportedDeck): string {
  const art =
    deck.entriesWithoutArt === 0
      ? "artwork stored for all of them"
      : `artwork stored for ${deck.artStored}; ${deck.entriesWithoutArt} arrived without art (Deck Builder omits art it could not fetch)`;
  return `${deck.totalCards} cards, ${deck.distinctCards} distinct, ${art}.`;
}

/** Spec 0008 — the narrow layout, where the open deck sits below the library. */
const PHONE = "(max-width: 720px)";
const narrow = () => typeof window !== "undefined" && window.matchMedia?.(PHONE).matches === true;

/**
 * Import — §2.81-§2.86, and §7.65's one name per owner.
 *
 * A name you already use is not a broken package: the notice offers
 * the name back to edit and imports the same file again under the new
 * one, so nobody has to find the file twice.
 */
function ImportPanel({ onImported }: { onImported: (deck: ImportedDeck) => Promise<void> }) {
  const [view, setView] = useState<ImportView>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [newName, setNewName] = useState("");
  const nameId = useId();

  const upload = useCallback(
    async (file: File, name?: string) => {
      // One request does the whole import and reports no progress
      // along the way, so the page says what is happening and does
      // not pretend to know how far it has got (§2.84).
      setView({ kind: "working", fileName: file.name });
      const result = await importDeck(file, fetch, name);
      if (result.ok) {
        setView({ kind: "imported", deck: result.deck });
        await onImported(result.deck);
      } else {
        setView({ kind: "failed", failure: result.failure, file });
        setNewName(result.failure.takenName ?? "");
      }
    },
    [onImported],
  );

  const working = view.kind === "working";

  return (
    <section className="pa-section" aria-labelledby="import-heading">
      <div className="pa-section-head">
        <h2 id="import-heading">Import</h2>
      </div>
      <div className="pa-section-body">
        <label
          className={`pa-drop${dragging ? " pa-drop-active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file && !working) void upload(file);
          }}
        >
          <input
            className="pa-visually-hidden"
            type="file"
            accept=".zip,application/zip"
            disabled={working}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared, because a file input fires NO change event
              // when the same file is chosen again -- and the
              // duplicate message is exactly what somebody re-picking
              // a file needs to see. Found by a browser test doing it.
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
          {working ? (
            <span className="pa-drop-title" role="status">
              Checking {view.fileName}: the package, the deck and every card…
            </span>
          ) : (
            <>
              <span className="pa-drop-title">Drop a deck package here, or choose a file</span>
              <span className="pa-drop-sub">
                A <code>.zip</code> exported by Proxic Deck Builder.
              </span>
            </>
          )}
        </label>
      </div>

      {view.kind === "imported" && (
        <div className="pa-notice pa-notice-ok pa-section-notice" role="status">
          <span aria-hidden="true" className="pa-notice-mark" />
          <span className="pa-notice-text">
            <strong>{view.deck.displayName} imported</strong>
            <span className="pa-notice-sub">{importedSentence(view.deck)}</span>
          </span>
        </div>
      )}

      {view.kind === "failed" && (
        <div className="pa-notice pa-notice-bad pa-section-notice" role="alert">
          <span aria-hidden="true" className="pa-notice-mark" />
          <span className="pa-notice-text">
            {/* §2.86 — a category, an explanation and the lines. A
                duplicate's sentence already names the deck you have
                (spec 0008: it was said twice). */}
            <strong>
              {headingFor(view.failure.errorCode) ?? "That package could not be imported"}
            </strong>
            <span className="pa-notice-sub">{view.failure.detail}</span>
            {view.failure.problems.length > 0 &&
              !["DUPLICATE_PACKAGE", "DECK_NAME_TAKEN"].includes(view.failure.errorCode) && (
                <ul className="pa-problems">
                  {view.failure.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
          </span>
        </div>
      )}

      {view.kind === "failed" && view.failure.errorCode === "DECK_NAME_TAKEN" && (
        <form
          className="pa-form pa-rename-import"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void upload(view.file, newName);
          }}
        >
          <label className="pa-label" htmlFor={nameId}>
            Import it as
          </label>
          <div className="pa-form-inline">
            <input
              id={nameId}
              className="pa-input"
              value={newName}
              maxLength={80}
              onChange={(event) => setNewName(event.target.value)}
              required
            />
            <button type="submit" className="pa-button">
              Import
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * One group of the library — My decks or Shared with me, never merged
 * (§4.59, §4.60): a deck lent to you is not yours to delete, and the
 * page does not offer to.
 */
function DeckGroup({
  title,
  decks,
  empty,
  owned,
  openId,
  onView,
  onDelete,
}: {
  title: string;
  decks: DeckSummary[];
  empty: string;
  owned: boolean;
  openId: string | null;
  onView: (deckId: string) => void;
  /** True when the deck went. */
  onDelete?: (deckId: string) => Promise<boolean>;
}) {
  const headingId = useId();
  // Amendment 10 — Delete asks first, on the row.
  const [confirming, setConfirming] = useState<string | null>(null);
  // Spec 0008 — a delete that did not happen says so, on its row.
  const [failed, setFailed] = useState<string | null>(null);

  const meta = (deck: DeckSummary) => {
    const cards = `${deck.totalCards} cards`;
    if (!owned) return `${cards} · shared by ${deck.ownerDisplayName}`;
    const holders = deck.shareCount ?? 0;
    return holders > 0 ? `${cards} · shared with ${holders}` : cards;
  };

  return (
    // A named region each, so "My decks" is a landmark a screen
    // reader can jump to (found by reading the page's own
    // accessibility tree, AGENTS TEST-011).
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="pa-group-head">
        {title}
      </h3>
      {decks.length === 0 && <p className="pa-group-empty">{empty}</p>}
      <ul className="pa-decks">
        {decks.map((deck) => (
          <li
            key={deck.deckId}
            className={`pa-deck-row${deck.deckId === openId ? " pa-deck-row-open" : ""}`}
          >
            {confirming === deck.deckId ? (
              <>
                <span className="pa-deck-text" role="alert">
                  <span className="pa-deck-name pa-deck-name-wrap">Delete {deck.displayName}?</span>
                  <span className="pa-deck-meta">
                    This can’t be undone, and everyone it is shared with loses it.
                  </span>
                </span>
                <button
                  type="button"
                  className="pa-small-button pa-small-button-warn"
                  onClick={() => {
                    setConfirming(null);
                    setFailed(null);
                    void onDelete?.(deck.deckId).then((gone) => {
                      if (!gone) setFailed(deck.deckId);
                    });
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="pa-small-button"
                  onClick={() => setConfirming(null)}
                >
                  Keep
                </button>
              </>
            ) : (
              <>
                {/* Spec 0012 — the deck's icon, its owner's choice or the suggestion. */}
                <DeckIcon name={iconOf(deck)} size={40} />
                <span className="pa-deck-text">
                  <span className="pa-deck-name">{deck.displayName}</span>
                  {failed === deck.deckId ? (
                    <span className="pa-deck-meta pa-deck-meta-bad" role="alert">
                      That deck could not be deleted. Try again.
                    </span>
                  ) : (
                    <span className="pa-deck-meta">{meta(deck)}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="pa-small-button"
                  aria-label={`View ${deck.displayName}`}
                  aria-pressed={deck.deckId === openId}
                  onClick={() => onView(deck.deckId)}
                >
                  View
                </button>
                {owned && onDelete && (
                  <button
                    type="button"
                    className="pa-small-button pa-small-button-faint"
                    aria-label={`Delete ${deck.displayName}`}
                    onClick={() => setConfirming(deck.deckId)}
                  >
                    Delete
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The open deck's name, whose it is, rename (yours only) and its numbers. */
function OpenDeck({
  detail,
  summary,
  justImported,
  onRenamed,
  onIcon,
  onChosen,
}: {
  detail: DeckDetail;
  /** Spec 0012 — the library's line for this deck: its colours and icon. */
  summary: DeckSummary | undefined;
  /** Spec 0012 — just imported: the icon picker is open, with "Later". */
  justImported: boolean;
  onRenamed: (displayName: string) => Promise<void>;
  onIcon: () => Promise<void>;
  /** The picker closed, chosen or not. */
  onChosen: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [choosingIcon, setChoosingIcon] = useState(justImported);
  const [iconBusy, setIconBusy] = useState(false);
  const [iconProblem, setIconProblem] = useState<string | null>(null);
  const changeIconButton = useRef<HTMLButtonElement | null>(null);
  const [name, setName] = useState(detail.displayName);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const renameButton = useRef<HTMLButtonElement | null>(null);
  const nameId = useId();
  const owned = detail.access !== "SHARED";

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const stop = () => {
    setRenaming(false);
    setProblem(null);
    // Focus goes back where it came from, not to the top of the page.
    requestAnimationFrame(() => renameButton.current?.focus());
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const outcome = await renameDeck(detail.deckId, name);
    setBusy(false);
    if (!outcome.ok) {
      // The server's words: it knows whether the name was taken or
      // could not be a name at all.
      setProblem(outcome.message);
      return;
    }
    await onRenamed(outcome.displayName);
    stop();
  };

  const icon = summary ? iconOf(summary) : "diamond";
  const suggested = suggestedIcon(summary?.colors);
  const closeIcons = () => {
    setChoosingIcon(false);
    setIconProblem(null);
    onChosen();
    requestAnimationFrame(() => changeIconButton.current?.focus());
  };
  const saveIcon = async (name: string) => {
    setIconBusy(true);
    const saved = await setDeckIcon(detail.deckId, name);
    setIconBusy(false);
    if (!saved) {
      setIconProblem("The icon could not be saved. Try again.");
      return;
    }
    await onIcon();
    closeIcons();
  };

  const stats = [
    { key: "Cards", value: String(detail.totalCards) },
    { key: "Distinct", value: String(detail.distinctCards) },
    { key: "Format", value: "Open" },
  ];

  return (
    <section className="pa-section" aria-labelledby="open-heading">
      <div className="pa-section-head">
        <h2 id="open-heading">Open deck</h2>
      </div>
      <div className="pa-open">
        <div className="pa-open-name">
          {renaming ? (
            <form onSubmit={(event) => void save(event)} className="pa-rename">
              <label className="pa-visually-hidden" htmlFor={nameId}>
                Deck name
              </label>
              <input
                id={nameId}
                ref={inputRef}
                className="pa-input pa-rename-input"
                value={name}
                maxLength={80}
                required
                aria-invalid={problem !== null}
                aria-describedby={problem ? `${nameId}-problem` : undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  setProblem(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") stop();
                }}
              />
              {problem && (
                <p id={`${nameId}-problem`} className="pa-field-problem" role="alert">
                  {problem}
                </p>
              )}
              <div className="pa-button-row">
                <button type="submit" className="pa-button pa-button-brass" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button type="button" className="pa-button pa-button-quiet" onClick={stop}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="pa-open-title-row">
                <DeckIcon name={icon} size={64} />
                <h3 className="pa-open-title">{detail.displayName}</h3>
                {/* Only for a deck you own: renaming one lent to you
                    would rename it for its owner (§7.65). */}
                {owned && (
                  <button
                    ref={renameButton}
                    type="button"
                    className="pa-small-button"
                    onClick={() => {
                      setName(detail.displayName);
                      setRenaming(true);
                    }}
                  >
                    Rename
                  </button>
                )}
                {owned && !choosingIcon && (
                  <button
                    ref={changeIconButton}
                    type="button"
                    className="pa-small-button"
                    onClick={() => setChoosingIcon(true)}
                  >
                    Change icon
                  </button>
                )}
              </div>
              <div className="pa-open-owner">
                {owned ? "Yours" : `Shared by ${detail.ownerDisplayName ?? "its owner"}`}
              </div>
            </>
          )}
        </div>
        <dl className="pa-stats">
          {stats.map((stat) => (
            <div key={stat.key} className="pa-stat">
              <dt>{stat.key}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {owned && choosingIcon && (
        <DeckIconPicker
          title={justImported ? "Choose an icon" : "Change icon"}
          current={icon}
          suggested={suggested}
          busy={iconBusy}
          problem={iconProblem}
          onUse={(name) => void saveIcon(name)}
          onCancel={closeIcons}
          cancelLabel={justImported ? "Later" : "Cancel"}
        />
      )}
    </section>
  );
}

/**
 * Who holds this deck, and lending it — PHASE_04 §4.70-§4.72 and
 * Amendment 10's list of players.
 *
 * Shown only for a deck you own. The list is fetched, not inferred:
 * `null` from the server means "not yours to see", which is different
 * from nobody holding it, and the panel then does not exist at all.
 * Keyed by deck in the page, so it never shows the last deck's list.
 */
function SharePanel({ detail, onChanged }: { detail: DeckDetail; onChanged: () => Promise<void> }) {
  const { lobby } = useLobbyConnection();
  const [list, setList] = useState<ShareList | null>(null);
  const [chosen, setChosen] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const selectId = useId();

  const refresh = useCallback(async () => {
    setList(await listShares(detail.deckId));
  }, [detail.deckId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (detail.access === "SHARED" || list === null) return null;

  const share = async (event: FormEvent) => {
    event.preventDefault();
    if (!chosen) return;
    setBusy(true);
    const outcome = await shareDeck(detail.deckId, chosen);
    setBusy(false);
    if (!outcome.ok) {
      // §4.72 — the server's wording, because it knows which case.
      setMessage({ ok: false, text: outcome.message });
      return;
    }
    setMessage({
      ok: true,
      text: outcome.created
        ? `Shared with ${outcome.recipient.displayName}.`
        : `${outcome.recipient.displayName} already had this deck.`,
    });
    setChosen("");
    await refresh();
    await onChanged();
  };

  const revoke = async (userId: string, displayName: string) => {
    const done = await revokeShare(detail.deckId, userId);
    setMessage(
      done
        ? { ok: true, text: `${displayName} can no longer see this deck.` }
        : { ok: false, text: "That share could not be revoked." },
    );
    await refresh();
    await onChanged();
  };

  return (
    <section className="pa-section" aria-labelledby="shared-heading">
      <div className="pa-section-head">
        <h2 id="shared-heading">Shared with</h2>
      </div>
      <div className="pa-chips">
        {list.shares.length === 0 && <span className="pa-group-empty">Nobody yet.</span>}
        {list.shares.map((recipient) => (
          <span key={recipient.userId} className="pa-chip">
            {/* Their picture, as the lobby shows it (owner 2026-10-24). */}
            <Avatar avatar={avatarOf(lobby, recipient.userId)} size={24} />
            {recipient.displayName}
            <button
              type="button"
              className="pa-chip-button"
              aria-label={`Revoke ${recipient.displayName}`}
              onClick={() => void revoke(recipient.userId, recipient.displayName)}
            >
              Revoke
            </button>
          </span>
        ))}
      </div>
      <form className="pa-share-form" onSubmit={(event) => void share(event)}>
        <label className="pa-visually-hidden" htmlFor={selectId}>
          Share this deck with a player
        </label>
        <span className="pa-select-wrap">
          <select
            id={selectId}
            className="pa-select"
            value={chosen}
            onChange={(event) => setChosen(event.target.value)}
          >
            <option value="">
              {list.candidates.length === 0 ? "Nobody else to share with" : "Choose a player"}
            </option>
            {list.candidates.map((candidate) => (
              <option key={candidate.username} value={candidate.username}>
                {candidate.displayName === candidate.username
                  ? candidate.username
                  : `${candidate.displayName} (${candidate.username})`}
              </option>
            ))}
          </select>
          <svg aria-hidden="true" width="11" height="7" viewBox="0 0 11 7">
            <path d="M1 1 L5.5 5.5 L10 1" />
          </svg>
        </span>
        <button type="submit" className="pa-button" disabled={busy || !chosen}>
          {busy ? "Sharing…" : "Share"}
        </button>
        <p className="pa-help">
          Players this deck is already shared with are not listed, and neither are you.
        </p>
        {message && (
          <p
            className={`pa-share-message${message.ok ? "" : " pa-share-message-bad"}`}
            role="status"
          >
            {message.text}
          </p>
        )}
      </form>
    </section>
  );
}

// --- the cards: size and close-up (spec 0008) ---------------------------------

type CardSize = "small" | "medium" | "large";
const SIZES: { value: CardSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];
const SIZE_KEY = "proxic.depot.cardSize";

/** The size this computer chose; Medium when none, or when storage cannot be read. */
function savedSize(): CardSize {
  try {
    const saved = window.localStorage.getItem(SIZE_KEY);
    return saved === "small" || saved === "large" ? saved : "medium";
  } catch {
    return "medium";
  }
}

/** §2.87 and Amendment 10 — the cards, banded as Forge sorted them; click one to zoom. */
function CardsPanel({ detail }: { detail: DeckDetail }) {
  const [size, setSize] = useState<CardSize>(savedSize);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const bands = bandsOf(detail.entries);
  // The close-up steps through the deck in the order the bands show it.
  const order: DeckEntryView[] = bands.flatMap((band) => band.entries);

  const choose = (next: CardSize) => {
    setSize(next);
    try {
      window.localStorage.setItem(SIZE_KEY, next);
    } catch {
      // A private window: the choice lasts until the page closes.
    }
  };

  const close = () => {
    const at = zoomed;
    setZoomed(null);
    // Back to the card it was opened from, not the top of the page.
    if (at !== null) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>(`[data-zoom-index="${at}"]`)?.focus(),
      );
    }
  };

  return (
    <section className="pa-section" aria-labelledby="cards-heading">
      <div className="pa-section-head">
        <h2 id="cards-heading">Cards</h2>
        <span className="pa-spacer" />
        <div className="pa-size-switch" role="group" aria-label="Card size">
          {SIZES.map((option) => (
            <button
              key={option.value}
              type="button"
              className="pa-size-option"
              aria-pressed={size === option.value}
              onClick={() => choose(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {bands.map((band) => (
        <div key={band.label} role="group" aria-label={`${band.label}, ${band.count} cards`}>
          <div className="pa-band-head" aria-hidden="true">
            <span>{band.label}</span>
            <span className="pa-band-count">{band.count}</span>
          </div>
          <div className="pa-card-grid" data-size={size}>
            {band.entries.map((entry) => {
              const index = order.indexOf(entry);
              return (
                <figure key={entry.lineNumber} className="pa-card">
                  <button
                    type="button"
                    className="pa-card-art"
                    data-zoom-index={index}
                    aria-label={`Zoom ${entry.cardName}`}
                    onClick={() => setZoomed(index)}
                  >
                    {entry.artUrl ? (
                      <img src={entry.artUrl} alt={entry.cardName} loading="lazy" />
                    ) : (
                      <span className="pa-card-noart">No art</span>
                    )}
                    <span className="pa-card-qty" aria-label={`${entry.quantity} copies`}>
                      {entry.quantity}
                    </span>
                  </button>
                  <figcaption>{entry.cardName}</figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      ))}
      {zoomed !== null && order[zoomed] && (
        <CardZoom cards={order} index={zoomed} onIndex={setZoomed} onClose={close} />
      )}
    </section>
  );
}

export default function DecksPage() {
  /** Null until the first answer; "failed" when the server did not give one. */
  const [library, setLibrary] = useState<DeckLibrary | "failed" | null>(null);
  const [open, setOpen] = useState<DeckDetail | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  /** Spec 0008 — on a phone the library folds while a deck is open. */
  const [libraryFolded, setLibraryFolded] = useState(false);
  /** Spec 0012 — the deck just imported, opened with its icon picker. */
  const [justImported, setJustImported] = useState<string | null>(null);
  // The deck asked for last: a slower answer for an earlier click is
  // dropped, so two quick Views always show the second (spec 0008).
  const asked = useRef<string | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    const next = await listDecks();
    setLibrary(next ?? "failed");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const view = useCallback((deckId: string) => {
    asked.current = deckId;
    setOpenFailed(false);
    void getDeck(deckId).then((detail) => {
      if (asked.current !== deckId) return;
      setOpen(detail);
      setOpenFailed(detail === null);
      if (narrow()) {
        // On a phone the deck is below the library: go to it.
        setLibraryFolded(true);
        requestAnimationFrame(() => mainRef.current?.scrollIntoView({ block: "start" }));
      }
    });
  }, []);

  const shown = library === null || library === "failed" ? null : library;
  const total = shown ? shown.mine.length + shown.sharedWithMe.length : 0;
  const folded = libraryFolded && open !== null;

  return (
    <main className="pa-main pa-depot">
      <h1 className="pa-visually-hidden">Deck Depot</h1>
      <div className="pa-depot-layout">
        <div className="pa-depot-side">
          <ImportPanel
            onImported={async (deck) => {
              await refresh();
              setJustImported(deck.deckId);
              view(deck.deckId);
            }}
          />

          <section
            className={`pa-section${folded ? " pa-library-folded" : ""}`}
            aria-labelledby="library-heading"
          >
            <div className="pa-section-head">
              <h2 id="library-heading">Deck library</h2>
              <span className="pa-spacer" />
              <span className="pa-count" aria-label={`${total} decks`}>
                {total}
              </span>
              <button
                type="button"
                className="pa-library-fold"
                aria-expanded={!folded}
                aria-label={folded ? "Show the deck library" : "Fold the deck library"}
                onClick={() => setLibraryFolded(!folded)}
              >
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
                  <path d={folded ? "M4 2 L8 6 L4 10" : "M2 4 L6 8 L10 4"} />
                </svg>
              </button>
            </div>
            {library === "failed" ? (
              <div className="pa-library-failed" role="alert">
                <span>Your decks could not be loaded.</span>
                <button type="button" className="pa-small-button" onClick={() => void refresh()}>
                  Try again
                </button>
              </div>
            ) : (
              <div className="pa-library-groups">
                <DeckGroup
                  title="My decks"
                  decks={shown?.mine ?? []}
                  empty={shown ? "Nothing imported yet." : "Loading…"}
                  owned
                  openId={open?.deckId ?? null}
                  onView={view}
                  onDelete={async (deckId) => {
                    const gone = await deleteDeck(deckId);
                    if (gone) {
                      setOpen((current) => (current?.deckId === deckId ? null : current));
                      await refresh();
                    }
                    return gone;
                  }}
                />
                <DeckGroup
                  title="Shared with me"
                  decks={shown?.sharedWithMe ?? []}
                  empty={shown ? "Nobody has shared a deck with you." : "Loading…"}
                  owned={false}
                  openId={open?.deckId ?? null}
                  onView={view}
                />
              </div>
            )}
          </section>
        </div>

        <div className="pa-depot-main" ref={mainRef}>
          {open ? (
            <>
              <OpenDeck
                key={open.deckId}
                detail={open}
                summary={[...(shown?.mine ?? []), ...(shown?.sharedWithMe ?? [])].find(
                  (deck) => deck.deckId === open.deckId,
                )}
                justImported={justImported === open.deckId}
                onIcon={refresh}
                onChosen={() => setJustImported(null)}
                onRenamed={async (displayName) => {
                  setOpen((current) => (current ? { ...current, displayName } : current));
                  await refresh();
                }}
              />
              <SharePanel key={`share-${open.deckId}`} detail={open} onChanged={refresh} />
              <CardsPanel key={`cards-${open.deckId}`} detail={open} />
            </>
          ) : (
            <section className="pa-section" aria-labelledby="open-heading">
              <div className="pa-section-head">
                <h2 id="open-heading">Open deck</h2>
              </div>
              <p
                className={`pa-open-empty${openFailed ? " pa-open-failed" : ""}`}
                role={openFailed ? "alert" : undefined}
              >
                {openFailed
                  ? "That deck could not be opened. It may have been deleted, or the server did not answer."
                  : "Choose View on a deck to see its cards and who it is shared with."}
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
