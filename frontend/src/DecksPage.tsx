// Deck import page — PHASE_02 §2.81–§2.87.
//
// Temporary, like the foundation page: a list and a grid, not a deck
// builder (§2.87). Its job is to prove the pipeline works from a
// browser and to show a player what went wrong when it does not.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteDeck,
  getDeck,
  headingFor,
  importDeck,
  listDecks,
  type DeckDetail,
  type DeckSummary,
  type ImportFailure,
  type ImportState,
  type ImportedDeck,
} from "./decks";

function ImportResult({ deck }: { deck: ImportedDeck }) {
  return (
    <section className="panel">
      {/* §2.85 — what was actually imported. */}
      <h2>{deck.displayName}</h2>
      <div className="row">
        <span className="name">Cards</span>
        <span className="state">{deck.totalCards}</span>
      </div>
      <div className="row">
        <span className="name">Distinct cards</span>
        <span className="state">{deck.distinctCards}</span>
      </div>
      <div className="row">
        <span className="name">Artwork stored</span>
        <span className="state">{deck.artStored}</span>
      </div>
      {deck.entriesWithoutArt > 0 && (
        <p className="hint">
          {deck.entriesWithoutArt} card{deck.entriesWithoutArt === 1 ? "" : "s"} arrived without
          artwork. The deck is fine — Deck Builder omits art it could not fetch.
        </p>
      )}
    </section>
  );
}

function ImportError({ failure }: { failure: ImportFailure }) {
  const heading = headingFor(failure.errorCode);
  return (
    <section className="panel error">
      {/* §2.86 — a category, an explanation, and the specific lines.
          Never "check the container logs". */}
      <h2>{heading ?? "That package could not be imported"}</h2>
      <p>{failure.detail}</p>
      {failure.problems.length > 0 && failure.errorCode !== "DUPLICATE_PACKAGE" && (
        <ul className="problems">
          {failure.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {failure.existingDeckId && (
        <p className="hint">
          Already imported as <code>{failure.existingDeckId}</code>.
        </p>
      )}
    </section>
  );
}

function DeckCards({ detail }: { detail: DeckDetail }) {
  return (
    <section className="panel">
      <h2>{detail.displayName}</h2>
      {/* §2.87 — a grid, to prove the image pipeline end to end. */}
      <div className="card-grid">
        {detail.entries.map((entry) => (
          <figure key={entry.lineNumber} className="card">
            {entry.artUrl ? (
              <img src={entry.artUrl} alt={entry.cardName} loading="lazy" />
            ) : (
              <div className="card-placeholder">no art</div>
            )}
            <figcaption>
              {entry.quantity}× {entry.cardName}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function DecksPage() {
  const [state, setState] = useState<ImportState>("idle");
  const [imported, setImported] = useState<ImportedDeck | null>(null);
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [open, setOpen] = useState<DeckDetail | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => setDecks(await listDecks()), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(
    async (file: File) => {
      setFailure(null);
      setImported(null);
      setState("uploading");

      // "validating" is not a progress bar. The server does the
      // whole import in one request and reports no intermediate
      // progress, and §2.84 forbids pretending otherwise.
      setState("validating");
      const result = await importDeck(file);
      if (result.ok) {
        setImported(result.deck);
        setState("imported");
        await refresh();
      } else {
        setFailure(result.failure);
        setState("failed");
      }
    },
    [refresh],
  );

  return (
    <main>
      <h1>PROXIC ARENA</h1>
      {/* §2.82 — this is not a generic deck-file importer. */}
      <p className="sub">
        Import a deck package exported by <strong>Proxic Deck Builder</strong>
      </p>

      <section className="panel">
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clearing the input is not tidiness. A file input fires
            // NO change event when the same file is chosen again, so
            // after one upload the page would silently ignore a
            // second attempt at the same deck — and the duplicate
            // message is exactly what a player re-picking a file
            // needs to see. Found by a browser test doing it twice.
            event.target.value = "";
            if (file) {
              setState("selected");
              void upload(file);
            }
          }}
        />
        <p className="hint">
          A <code>.zip</code> containing the decklist and its card art. Open Format: 60–65 cards, at
          most 4 of any card, basic lands unlimited.
        </p>
        {state === "uploading" && <p>Uploading…</p>}
        {state === "validating" && <p>Checking the package, the deck and every card…</p>}
      </section>

      {imported && <ImportResult deck={imported} />}
      {failure && <ImportError failure={failure} />}

      <section className="panel">
        <h2>Imported decks</h2>
        {decks.length === 0 && <p className="hint">Nothing imported yet.</p>}
        {decks.map((deck) => (
          <div className="row" key={deck.deckId}>
            <span className="name">{deck.displayName}</span>
            <span className="state">
              {deck.totalCards} cards
              <button
                type="button"
                onClick={() => {
                  void getDeck(deck.deckId).then(setOpen);
                }}
              >
                view
              </button>
              <button
                type="button"
                onClick={() => {
                  void deleteDeck(deck.deckId).then(() => {
                    setOpen((current) => (current?.deckId === deck.deckId ? null : current));
                    return refresh();
                  });
                }}
              >
                delete
              </button>
            </span>
          </div>
        ))}
      </section>

      {open && <DeckCards detail={open} />}

      <p className="verdict">
        <a href="/">Back to the foundation page</a>
      </p>
    </main>
  );
}
