// Deck import page — PHASE_02 §2.81–§2.87.
//
// Temporary, like the foundation page: a list and a grid, not a deck
// builder (§2.87). Its job is to prove the pipeline works from a
// browser and to show a player what went wrong when it does not.

import { Link } from "react-router-dom";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  deleteDeck,
  getDeck,
  headingFor,
  importDeck,
  listDecks,
  listShares,
  revokeShare,
  shareDeck,
  EMPTY_LIBRARY,
  type DeckDetail,
  type DeckLibrary,
  type DeckSummary,
  type ShareRecipient,
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

/**
 * Share management — PHASE_04 §4.70, §4.71, §4.72.
 *
 * Rendered only for a deck the viewer owns. §4.71 asks that a
 * recipient not receive owner controls, and the server refuses them
 * regardless (§4.80); hiding the panel is the courtesy, the refusal
 * is the protection.
 *
 * The share list itself is fetched, not inferred: `null` back from
 * the server means "not yours to see", which is different from an
 * empty list, and the panel disappears rather than showing an empty
 * one.
 */
function SharePanel({ detail }: { detail: DeckDetail }) {
  const [shares, setShares] = useState<ShareRecipient[] | null>(null);
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setShares(await listShares(detail.deckId));
  }, [detail.deckId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // §4.71 — not the owner, no panel. The server already said so by
  // answering 403 to the share list, and `access` says it directly.
  if (detail.access === "SHARED") return null;
  if (shares === null) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const outcome = await shareDeck(detail.deckId, username);
    setBusy(false);
    if (!outcome.ok) {
      // §4.72 — the server's wording, because it knows which case
      // this was: unknown user, disabled account, or yourself.
      setMessage(outcome.message);
      return;
    }
    setMessage(
      outcome.created
        ? `Shared with ${outcome.recipient.displayName}.`
        : `${outcome.recipient.displayName} already had this deck.`,
    );
    setUsername("");
    await refresh();
  };

  return (
    <section className="panel" aria-label="Share this deck">
      <h2>Share this deck</h2>

      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="share-username">Username</label>
        <input
          id="share-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="off"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? "Sharing…" : "Share"}
        </button>
      </form>

      {message && <p className="verdict">{message}</p>}

      <h3>Currently shared with</h3>
      {shares.length === 0 && <p className="hint">Nobody yet.</p>}
      {shares.map((recipient) => (
        <div className="row" key={recipient.userId}>
          <span className="name">
            {recipient.displayName} <span className="hint">@{recipient.username}</span>
          </span>
          <span className="state">
            <button
              type="button"
              onClick={() => {
                void revokeShare(detail.deckId, recipient.userId).then((done) => {
                  setMessage(
                    done
                      ? `${recipient.displayName} can no longer see this deck.`
                      : "That share could not be revoked.",
                  );
                  return refresh();
                });
              }}
            >
              revoke
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

/**
 * One titled list of decks — PHASE_04 §4.58–§4.60, §4.112, §4.113.
 *
 * `owned` decides whether a delete control exists at all. The server
 * refuses either way (§4.80), so this is about not offering an
 * action that will be refused — hiding it is a courtesy, never the
 * protection.
 */
function DeckList({
  title,
  decks,
  empty,
  owned,
  onView,
  onDelete,
}: {
  title: string;
  decks: DeckSummary[];
  empty: string;
  owned: boolean;
  onView: (deckId: string) => void;
  onDelete?: (deckId: string) => void;
}) {
  return (
    // NAMED, because a <section> with no accessible name is not
    // exposed as a landmark at all -- a screen reader can jump to
    // "My decks" on the lobby page and could not here, on the page
    // whose whole job is decks. Found by reading the page's own
    // accessibility tree (AGENTS TEST-011).
    <section className="panel" aria-label={title}>
      <h2>{title}</h2>
      {decks.length === 0 && <p className="hint">{empty}</p>}
      {decks.map((deck) => (
        <div className="row" key={deck.deckId}>
          <span className="name">
            {deck.displayName}
            {/* §4.59 — "shared by Pat". Only where it tells you
                something you did not already know. */}
            {!owned && <span className="hint"> · shared by {deck.ownerDisplayName}</span>}
          </span>
          <span className="state">
            {deck.totalCards} cards
            <button type="button" onClick={() => onView(deck.deckId)}>
              view
            </button>
            {owned && onDelete && (
              <button type="button" onClick={() => onDelete(deck.deckId)}>
                delete
              </button>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}

export default function DecksPage() {
  const [state, setState] = useState<ImportState>("idle");
  const [imported, setImported] = useState<ImportedDeck | null>(null);
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  const [library, setLibrary] = useState<DeckLibrary>(EMPTY_LIBRARY);
  const [open, setOpen] = useState<DeckDetail | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => setLibrary(await listDecks()), []);

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
      {/* PHASE_04 §4.109, §4.110 — the feature is called Deck Depot
          and lives at the Phase 2 route, so no link anywhere breaks.
          §2.82 still holds: this is not a generic deck-file
          importer. */}
      <p className="sub">
        Deck Depot — import a deck package exported by <strong>Proxic Deck Builder</strong>
      </p>

      <section className="panel" aria-label="Import a deck">
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

      <DeckList
        title="My decks"
        decks={library.mine}
        empty="Nothing imported yet."
        owned
        onView={(deckId) => void getDeck(deckId).then(setOpen)}
        onDelete={(deckId) =>
          void deleteDeck(deckId).then(() => {
            setOpen((current) => (current?.deckId === deckId ? null : current));
            return refresh();
          })
        }
      />

      {/* §4.59, §4.60 — a separate list, never merged with the one
          above: a deck someone shared with you is not yours to
          delete, and the page should not invite you to try. */}
      <DeckList
        title="Shared with me"
        decks={library.sharedWithMe}
        empty="Nobody has shared a deck with you."
        owned={false}
        onView={(deckId) => void getDeck(deckId).then(setOpen)}
      />

      {open && <SharePanel detail={open} />}
      {open && <DeckCards detail={open} />}

      <p className="verdict">
        {/* The lobby is where a deck gets used, so the Deck Depot
            should point at it rather than only back home. */}
        <Link to="/play">Play</Link> · <a href="/">Back to the foundation page</a>
      </p>
    </main>
  );
}
