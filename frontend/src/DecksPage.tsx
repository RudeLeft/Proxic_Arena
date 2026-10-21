// The Deck Depot — PHASE_07 §7.65 and Amendment 10, over Phase 4.
//
// The canvas's Depot: import on the left with the library under it,
// the open deck on the right with who holds it and its cards. Still
// not a deck builder (§2.87): decks are made in Proxic Deck Builder
// and arrive here as packages.
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
  shareDeck,
  EMPTY_LIBRARY,
  type DeckDetail,
  type DeckLibrary,
  type DeckSummary,
  type ImportFailure,
  type ImportedDeck,
  type ShareList,
} from "./decks";

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

/**
 * Import — §2.81-§2.86, and §7.65's one name per owner.
 *
 * A name you already use is not a broken package: the notice offers
 * the name back to edit and imports the same file again under the new
 * one, so nobody has to find the file twice.
 */
function ImportPanel({
  library,
  onImported,
}: {
  library: DeckLibrary;
  onImported: (deck: ImportedDeck) => Promise<void>;
}) {
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
  const existingName = (deckId: string) =>
    library.mine.find((deck) => deck.deckId === deckId)?.displayName ?? deckId;

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
                A <code>.zip</code> exported by Proxic Deck Builder. Open Format: 60–65 cards, at
                most 4 of any card, basic lands unlimited.
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
            {/* §2.86 — a category, an explanation and the lines. */}
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
            {view.failure.existingDeckId && (
              <span className="pa-notice-sub">
                Already imported as “{existingName(view.failure.existingDeckId)}”, in My decks.
              </span>
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
  onDelete?: (deckId: string) => Promise<void>;
}) {
  const headingId = useId();
  // Amendment 10 — Delete asks first, on the row.
  const [confirming, setConfirming] = useState<string | null>(null);

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
                    void onDelete?.(deck.deckId);
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
                <span className="pa-deck-text">
                  <span className="pa-deck-name">{deck.displayName}</span>
                  <span className="pa-deck-meta">{meta(deck)}</span>
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
  onRenamed,
}: {
  detail: DeckDetail;
  onRenamed: (displayName: string) => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
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
 */
function SharePanel({ detail, onChanged }: { detail: DeckDetail; onChanged: () => Promise<void> }) {
  const [list, setList] = useState<ShareList | null>(null);
  const [chosen, setChosen] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const selectId = useId();

  const refresh = useCallback(async () => {
    setList(await listShares(detail.deckId));
  }, [detail.deckId]);

  useEffect(() => {
    setMessage(null);
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

/** §2.87 and Amendment 10 — the cards, banded as Forge sorted them. */
function CardsPanel({ detail }: { detail: DeckDetail }) {
  return (
    <section className="pa-section" aria-labelledby="cards-heading">
      <div className="pa-section-head">
        <h2 id="cards-heading">Cards</h2>
      </div>
      {bandsOf(detail.entries).map((band) => (
        <div key={band.label} role="group" aria-label={`${band.label}, ${band.count} cards`}>
          <div className="pa-band-head" aria-hidden="true">
            <span>{band.label}</span>
            <span className="pa-band-count">{band.count}</span>
          </div>
          <div className="pa-card-grid">
            {band.entries.map((entry) => (
              <figure key={entry.lineNumber} className="pa-card">
                <span className="pa-card-art">
                  {entry.artUrl ? (
                    <img src={entry.artUrl} alt={entry.cardName} loading="lazy" />
                  ) : (
                    <span className="pa-card-noart">No art</span>
                  )}
                  <span className="pa-card-qty" aria-label={`${entry.quantity} copies`}>
                    {entry.quantity}
                  </span>
                </span>
                <figcaption>{entry.cardName}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export default function DecksPage() {
  const [library, setLibrary] = useState<DeckLibrary>(EMPTY_LIBRARY);
  const [open, setOpen] = useState<DeckDetail | null>(null);

  const refresh = useCallback(async () => setLibrary(await listDecks()), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const view = useCallback((deckId: string) => {
    void getDeck(deckId).then(setOpen);
  }, []);

  const total = library.mine.length + library.sharedWithMe.length;

  return (
    <main className="pa-main pa-depot">
      <h1 className="pa-visually-hidden">Deck Depot</h1>
      <div className="pa-depot-layout">
        <div className="pa-depot-side">
          <ImportPanel library={library} onImported={refresh} />

          <section className="pa-section" aria-labelledby="library-heading">
            <div className="pa-section-head">
              <h2 id="library-heading">Deck library</h2>
              <span className="pa-spacer" />
              <span className="pa-count" aria-label={`${total} decks`}>
                {total}
              </span>
            </div>
            <DeckGroup
              title="My decks"
              decks={library.mine}
              empty="Nothing imported yet."
              owned
              openId={open?.deckId ?? null}
              onView={view}
              onDelete={async (deckId) => {
                await deleteDeck(deckId);
                setOpen((current) => (current?.deckId === deckId ? null : current));
                await refresh();
              }}
            />
            <DeckGroup
              title="Shared with me"
              decks={library.sharedWithMe}
              empty="Nobody has shared a deck with you."
              owned={false}
              openId={open?.deckId ?? null}
              onView={view}
            />
          </section>
        </div>

        <div className="pa-depot-main">
          {open ? (
            <>
              <OpenDeck
                key={open.deckId}
                detail={open}
                onRenamed={async (displayName) => {
                  setOpen((current) => (current ? { ...current, displayName } : current));
                  await refresh();
                }}
              />
              <SharePanel detail={open} onChanged={refresh} />
              <CardsPanel detail={open} />
            </>
          ) : (
            <section className="pa-section" aria-labelledby="open-heading">
              <div className="pa-section-head">
                <h2 id="open-heading">Open deck</h2>
              </div>
              <p className="pa-open-empty">
                Choose View on a deck to see its cards and who it is shared with.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
