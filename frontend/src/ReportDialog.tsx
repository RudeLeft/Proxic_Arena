// Bug reports and ideas — spec 0039.
//
// One button, the same everywhere: a gold bug beside the gear in a game,
// "Report" beside Sign out on every other page. Pressing it takes a
// picture of the screen first (before the form covers it), then opens the
// form. The game carries on behind it; nobody else is told.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { toPng } from "html-to-image";
import { apiFetch } from "./auth";
import { logLine, recentLog } from "./reportLog";
import "./report.css";

/** What a game screen knows about the moment a report is about. */
export interface ReportGame {
  matchId: string;
  opponent: string;
  turn: number;
  /** "your turn" or "Pat's turn". */
  whose: string;
  /** "Main 1", "Combat"... */
  step: string;
  /** Card names on the table, in hand and on the stack: the picker's list. */
  cards: string[];
}

const WHERE = [
  "In a game",
  "Lobby and rooms",
  "Deck Depot",
  "Hall of Champions",
  "Account and sign-in",
  "Admin",
  "Somewhere else",
];
const PART = [
  "A card did the wrong thing",
  "Playing a card or ability",
  "Attacking or blocking",
  "Targets and choices",
  "Mana and paying costs",
  "The stack and responding",
  "Turn steps and passing",
  "Something looks wrong on screen",
  "The game froze or stopped",
  "I got disconnected",
  "Something else",
];
const IMPACT = ["Game stopped", "Couldn’t do what I meant", "Looks wrong", "Small thing"];
const BEFORE = ["First time", "Sometimes", "Every time"];
const WHEN = ["Just now", "Earlier in this game", "In an earlier game"];
const ABOUT = [
  "The game screen",
  "Playing a game (rules, speed)",
  "Lobby and rooms",
  "Deck Depot",
  "Hall of Champions",
  "Account",
  "Something new",
];
const MATTERS = ["Nice to have", "I’d use it every game", "I’d play more with it"];

/** The page a path is, in the form's words. */
export function pageOf(path: string, inGame: boolean): string {
  if (inGame) return "In a game";
  if (path.startsWith("/decks")) return "Deck Depot";
  if (path.startsWith("/hall")) return "Hall of Champions";
  if (path.startsWith("/account")) return "Account and sign-in";
  if (path.startsWith("/admin")) return "Admin";
  if (path.startsWith("/play")) return "Lobby and rooms";
  return "Somewhere else";
}

/** "Chrome 130 on Windows", from the browser's own description. */
export function browserOf(agent: string): string {
  // Edge and Chrome both say "Chrome": Edge first.
  const browsers: [RegExp, string][] = [
    [/Edg\/(\d+)/, "Edge"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+).*Safari\//, "Safari"],
  ];
  const systems: [RegExp, string][] = [
    [/Windows/, "Windows"],
    [/Android/, "Android"],
    [/iPhone|iPad/, "iOS"],
    [/Mac OS X/, "macOS"],
    [/Linux/, "Linux"],
  ];
  let name = "A browser";
  for (const [pattern, label] of browsers) {
    const match = pattern.exec(agent);
    if (match) {
      name = `${label} ${match[1]}`;
      break;
    }
  }
  const system = systems.find(([pattern]) => pattern.test(agent))?.[1];
  return system ? `${name} on ${system}` : name;
}

const BUG_PATH =
  "M9 7.5a3 3 0 0 1 6 0M8 10h8v5a4 4 0 0 1-8 0zM12 10v9M4 12h4M16 12h4M5 18l3-2M19 18l-3-2M6 7l2.5 2.5M18 7l-2.5 2.5";

function BugIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={BUG_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The button, and the form it opens. */
export function ReportButton({ place, game }: { place: "header" | "game"; game?: ReportGame }) {
  const [open, setOpen] = useState(false);
  const [picture, setPicture] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const press = async () => {
    if (busy) return;
    setBusy(true);
    logLine("report", "Report pressed");
    // The picture first, before the form covers the screen.
    let shot: string | null = null;
    try {
      shot = await toPng(document.body, {
        pixelRatio: 1,
        cacheBust: false,
        filter: (node) => !(node instanceof HTMLElement && node.dataset["reportSkip"] === "true"),
      });
    } catch {
      shot = null;
    }
    setPicture(shot);
    setBusy(false);
    setOpen(true);
  };
  return (
    <>
      {place === "header" ? (
        <button
          type="button"
          className="pa-report-button"
          disabled={busy}
          onClick={() => void press()}
          aria-label="Report a problem or an idea"
          data-report-skip="true"
        >
          <BugIcon size={18} />
          {busy ? "One moment…" : "Report"}
        </button>
      ) : (
        <button
          type="button"
          className="pa-report-coin"
          disabled={busy}
          onClick={() => void press()}
          aria-label="Report a problem or an idea"
          title="Report a problem or an idea"
          data-report-skip="true"
        >
          <BugIcon size={22} />
        </button>
      )}
      {open && (
        <ReportDialog
          {...(game ? { game } : {})}
          picture={picture}
          onClose={() => {
            setOpen(false);
            setPicture(null);
          }}
        />
      )}
    </>
  );
}

function Choice({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="pa-report-choice">
      <legend>{legend}</legend>
      <div>
        {options.map((option) => (
          <button
            type="button"
            key={option}
            aria-pressed={value === option}
            className={value === option ? "pa-report-pill pa-report-pill-on" : "pa-report-pill"}
            onClick={() => onChange(value === option ? "" : option)}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <label className="pa-report-field">
      <span>
        {label}
        {note && <span className="pa-report-note"> ({note})</span>}
      </span>
      {children}
    </label>
  );
}

export function ReportDialog({
  game,
  picture: taken,
  onClose,
}: {
  game?: ReportGame;
  picture: string | null;
  onClose: () => void;
}) {
  const { pathname } = useLocation();
  const [kind, setKind] = useState<"PROBLEM" | "IDEA">("PROBLEM");
  const [where, setWhere] = useState(pageOf(pathname, Boolean(game)));
  const [part, setPart] = useState("");
  const [cards, setCards] = useState<string[]>([]);
  const [cardText, setCardText] = useState("");
  const [happened, setHappened] = useState("");
  const [expected, setExpected] = useState("");
  const [impact, setImpact] = useState("");
  const [before, setBefore] = useState("");
  const [when, setWhen] = useState(WHEN[0]!);
  const [about, setAbout] = useState(game ? ABOUT[0]! : "");
  const [title, setTitle] = useState("");
  const [want, setWant] = useState("");
  const [helps, setHelps] = useState("");
  const [matters, setMatters] = useState("");
  const [withShot, setWithShot] = useState(taken !== null);
  const [added, setAdded] = useState<string | null>(null);
  const [withRecord, setWithRecord] = useState(true);
  const [version, setVersion] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const first = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    first.current?.focus({ preventScroll: true });
    void fetch("/api/version")
      .then((r) => (r.ok ? (r.json() as Promise<{ proxicVersion?: string }>) : null))
      .then((v) => setVersion(v?.proxicVersion ?? ""))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  const addPicture = (file: File | null | undefined) => {
    if (!file || !/^image\/(png|jpeg)$/.test(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAdded(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const addCard = (name: string) => {
    const clean = name.trim();
    if (clean && !cards.includes(clean) && cards.length < 12) setCards([...cards, clean]);
    setCardText("");
  };

  const screen = `${window.innerWidth}×${window.innerHeight}`;
  const browser = browserOf(navigator.userAgent);
  const ready = kind === "PROBLEM" ? happened.trim().length > 0 : title.trim().length > 0;

  const send = async () => {
    if (!ready || sending) return;
    setSending(true);
    setFailure(null);
    const answers =
      kind === "PROBLEM"
        ? {
            where,
            ...(where === "In a game" && part ? { part } : {}),
            ...(cards.length ? { cards } : {}),
            happened,
            ...(expected ? { expected } : {}),
            ...(impact ? { impact } : {}),
            ...(before ? { before } : {}),
            ...(game ? { when } : {}),
          }
        : {
            ...(about ? { about } : {}),
            title,
            ...(want ? { want } : {}),
            ...(helps ? { helps } : {}),
            ...(matters ? { matters } : {}),
          };
    const context = {
      page: pageOf(pathname, Boolean(game)),
      ...(game
        ? {
            game: `with ${game.opponent}`,
            turn: String(game.turn),
            whose: game.whose,
            step: game.step,
          }
        : {}),
      version,
      browser,
      screen,
    };
    const picture = added ?? (withShot ? taken : null);
    logLine("report", `Report sent (${kind.toLowerCase()})`);
    try {
      const response = await apiFetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          answers,
          context,
          ...(game ? { matchId: game.matchId, includeRecord: withRecord } : {}),
          ...(picture ? { picture } : {}),
          ...(kind === "PROBLEM" ? { browserLog: recentLog() } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        number?: number;
        detail?: string;
      };
      if (response.ok && typeof body.number === "number") setSent(body.number);
      else setFailure(body.detail ?? "Your report could not be sent. Try again.");
    } catch {
      setFailure("Your report could not be sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent !== null) {
    return (
      <div className="pa-report-backdrop" data-report-skip="true">
        <div className="pa-report-sent" role="status">
          <span className="pa-report-sent-title">Thanks — report sent</span>
          <span>
            It went to the admins
            {kind === "PROBLEM" ? " with your page’s log" : ""}
            {kind === "PROBLEM" && game && withRecord ? " and this game’s record" : ""}. Number{" "}
            <b>#{sent}</b>, if you want to mention it.
          </span>
          {game && <span className="pa-report-note">Your game carried on the whole time.</span>}
          <div className="pa-report-actions">
            <button type="button" className="pa-report-quiet" onClick={onClose} autoFocus>
              {game ? "Back to the game" : "Close"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pa-report-backdrop" data-report-skip="true">
      <div
        className="pa-report"
        role="dialog"
        aria-label="Report a problem or an idea"
        onPaste={(event) => addPicture(event.clipboardData.files[0])}
      >
        <div className="pa-report-tabs" role="tablist">
          <button
            ref={first}
            type="button"
            role="tab"
            aria-selected={kind === "PROBLEM"}
            onClick={() => setKind("PROBLEM")}
          >
            Report a problem
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "IDEA"}
            onClick={() => setKind("IDEA")}
          >
            Suggest an idea
          </button>
        </div>
        <div className="pa-report-body">
          {kind === "PROBLEM" ? (
            <>
              <div className="pa-report-facts">
                {game && <span>In a game with {game.opponent}</span>}
                {game && (
                  <span>
                    Turn {game.turn} · {game.whose} · {game.step}
                  </span>
                )}
                <span>
                  {version ? `Proxic ${version} · ` : ""}
                  {browser} · {screen}
                </span>
              </div>
              <div className="pa-report-pair">
                <Field label="Where were you?">
                  <select value={where} onChange={(e) => setWhere(e.target.value)}>
                    {WHERE.map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </Field>
                {where === "In a game" && (
                  <Field label="What part of the game?">
                    <select value={part} onChange={(e) => setPart(e.target.value)}>
                      <option value="">Choose one</option>
                      {PART.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              <div className="pa-report-field">
                <span>
                  Which cards?{" "}
                  <span className="pa-report-note">
                    (optional{game ? ": pick from this game, or type a name" : ""})
                  </span>
                </span>
                <div className="pa-report-cards">
                  {cards.map((card) => (
                    <button
                      type="button"
                      key={card}
                      className="pa-report-card"
                      aria-label={`Remove ${card}`}
                      onClick={() => setCards(cards.filter((c) => c !== card))}
                    >
                      {card} ×
                    </button>
                  ))}
                  <input
                    list="pa-report-card-names"
                    value={cardText}
                    placeholder="Add a card…"
                    aria-label="Add a card"
                    onChange={(e) => {
                      const value = e.target.value;
                      if (game?.cards.includes(value)) addCard(value);
                      else setCardText(value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCard(cardText);
                      }
                    }}
                  />
                  <datalist id="pa-report-card-names">
                    {(game?.cards ?? []).map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
              </div>
              <Field label="What happened?" note="needed">
                <textarea
                  rows={3}
                  value={happened}
                  maxLength={4000}
                  placeholder="I cast Lightning Bolt at Pat’s Goblin Guide and it hit me instead."
                  onChange={(e) => setHappened(e.target.value)}
                />
              </Field>
              <Field label="What did you expect?">
                <textarea
                  rows={2}
                  value={expected}
                  maxLength={4000}
                  onChange={(e) => setExpected(e.target.value)}
                />
              </Field>
              <div className="pa-report-pair">
                <Choice
                  legend="How much did it get in the way?"
                  options={IMPACT}
                  value={impact}
                  onChange={setImpact}
                />
                <Choice
                  legend="Has it happened before?"
                  options={BEFORE}
                  value={before}
                  onChange={setBefore}
                />
              </div>
              {game && (
                <Field label="When?">
                  <select value={when} onChange={(e) => setWhen(e.target.value)}>
                    {WHEN.map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          ) : (
            <>
              <div className="pa-report-pair">
                <Field label="What is it about?">
                  <select value={about} onChange={(e) => setAbout(e.target.value)}>
                    <option value="">Choose one</option>
                    {ABOUT.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Your idea in a few words" note="needed">
                  <input
                    type="text"
                    value={title}
                    maxLength={200}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="What would you like?">
                <textarea
                  rows={3}
                  value={want}
                  maxLength={4000}
                  onChange={(e) => setWant(e.target.value)}
                />
              </Field>
              <Field label="What would it help with?">
                <textarea
                  rows={2}
                  value={helps}
                  maxLength={4000}
                  onChange={(e) => setHelps(e.target.value)}
                />
              </Field>
              <Choice
                legend="How much would it matter to you?"
                options={MATTERS}
                value={matters}
                onChange={setMatters}
              />
            </>
          )}
          <div className="pa-report-picture">
            {taken && !added && (
              <label>
                <input
                  type="checkbox"
                  checked={withShot}
                  onChange={(e) => setWithShot(e.target.checked)}
                />
                Add a picture of my screen as it is now
              </label>
            )}
            {added && (
              <span>
                Your picture is added.{" "}
                <button type="button" className="pa-report-link" onClick={() => setAdded(null)}>
                  Remove it
                </button>
              </span>
            )}
            <label className="pa-report-drop">
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => addPicture(e.target.files?.[0])}
              />
              or choose / paste a picture
            </label>
          </div>
          {kind === "PROBLEM" ? (
            <div className="pa-report-sentwith">
              <b>Sent with your report</b>
              {game && (
                <label>
                  <input
                    type="checkbox"
                    checked={withRecord}
                    onChange={(e) => setWithRecord(e.target.checked)}
                  />
                  This game’s full record: every move and choice both of you made. Only the admins
                  see it.
                </label>
              )}
              <span className="pa-report-note">
                Also: what your screen did in the last 15 minutes (clicks, messages, errors), the
                Proxic version, your browser and screen size.
              </span>
            </div>
          ) : (
            <span className="pa-report-note">
              Ideas send only what you write and any picture you add, with the page you were on and
              the Proxic version.
            </span>
          )}
          {failure && (
            <p className="pa-report-failure" role="alert">
              {failure}
            </p>
          )}
        </div>
        <div className="pa-report-actions">
          <button type="button" className="pa-report-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pa-report-send"
            disabled={!ready || sending}
            onClick={() => void send()}
          >
            {sending ? "Sending…" : kind === "PROBLEM" ? "Send report" : "Send idea"}
          </button>
        </div>
      </div>
    </div>
  );
}
