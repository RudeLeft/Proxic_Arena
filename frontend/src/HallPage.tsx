// The Hall of Champions — spec 0018 (owner 2026-10-26/27).
//
// Its own page: the season's four places and the Champion's Belt in a
// band across the top, the leaderboard (this season or all time) beside
// a tabbed panel of records, rivalries, the latest results and past
// seasons. One screen on a desktop, nothing scrolls (owner H6); a phone
// stacks the parts and scrolls. The numbers are the server's
// (GET /api/hall); this page only draws them, and fetches them again
// whenever a game ends (the lobby's STANDINGS message says so).

import { useEffect, useId, useState } from "react";
import trophyBronze from "./assets/trophies/trophy-bronze.webp";
import trophyGold from "./assets/trophies/trophy-gold.webp";
import trophyLast from "./assets/trophies/trophy-last.webp";
import trophySilver from "./assets/trophies/trophy-silver.webp";
import belt from "./assets/trophies/belt.webp";
import { useAuth } from "./AuthContext";
import { Avatar } from "./avatars";
import { DeckIcon, iconOf } from "./deckIcons";
import {
  badgeTip,
  fetchHall,
  heldFor,
  latestText,
  monthName,
  ratingText,
  timeLeft,
  winPercent,
  wonText,
  type Hall,
  type HallPlace,
  type HallRow,
} from "./hall";
import type { LobbyState } from "./lobby";
import { ICON, SEAT_AVATAR, avatarOf, type Rank } from "./lobbyView";
import { useLobbyConnection } from "./shell/LobbyConnection";

const PLACES: { place: number; label: string; trophy: string; rank: Rank }[] = [
  { place: 1, label: "1st place", trophy: trophyGold, rank: 1 },
  { place: 2, label: "2nd place", trophy: trophySilver, rank: 2 },
  { place: 3, label: "3rd place", trophy: trophyBronze, rank: 3 },
  { place: 4, label: "Last place", trophy: trophyLast, rank: "last" },
];

const TABS = ["Records", "Rivalries", "Latest", "Past seasons"] as const;
type Tab = (typeof TABS)[number];

/** A player's name from the lobby's list; "A player" for one who has gone. */
function nameIn(lobby: LobbyState, userId: string | null | undefined): string {
  return lobby.players.find((p) => p.userId === userId)?.displayName ?? "A player";
}

export default function HallPage() {
  const { lobby } = useLobbyConnection();
  const { state: auth } = useAuth();
  const me = auth.status === "authenticated" ? auth.user.userId : null;
  const [hall, setHall] = useState<Hall | null>(null);
  const [failed, setFailed] = useState(false);
  const [scope, setScope] = useState<"season" | "all">("season");
  const [tab, setTab] = useState<Tab>("Records");
  const now = Date.now();

  // Fetched on opening, and again whenever a finished game moves the
  // standings (the server sends STANDINGS to everybody then).
  const standings = lobby.standings;
  useEffect(() => {
    let current = true;
    void fetchHall().then((next) => {
      if (!current) return;
      setFailed(next === null);
      if (next) setHall(next);
    });
    return () => {
      current = false;
    };
  }, [standings]);

  const name = (userId: string | null | undefined) => nameIn(lobby, userId);

  return (
    <main className="pa-main pa-hall-page">
      <h1 className="pa-visually-hidden">Hall of Champions</h1>
      {!hall ? (
        <p className="pa-group-empty">
          {failed ? "The Hall of Champions could not be loaded. Try again shortly." : "Loading…"}
        </p>
      ) : (
        <>
          <section className="pa-panel pa-hp-band" aria-label="This season">
            <div className="pa-hp-season">
              <div className="pa-hp-season-top">
                <h2>
                  Season {hall.season.number} · {monthName(hall.season.month)}
                </h2>
                <span className="pa-hp-left">
                  Trophies are handed out in <b>{timeLeft(hall.season.endsAt, now)}</b>; then
                  everyone starts again at 1000.
                </span>
              </div>
              <Places places={hall.season.places} lobby={lobby} />
            </div>
            <div className="pa-hp-belt" aria-label="The Champion's Belt">
              <img
                className="pa-hp-belt-art"
                src={belt}
                alt="The Champion's Belt"
                width={270}
                height={108}
              />
              {hall.belt.holder ? (
                <span className="pa-hp-holder">
                  <Avatar avatar={avatarOf(lobby, hall.belt.holder)} size={SEAT_AVATAR} />
                  <span>
                    <b>{name(hall.belt.holder)}</b>
                    <small>
                      {heldFor(hall.belt.since, now)}
                      {hall.belt.defences > 0 &&
                        ` · defended ${hall.belt.defences} ${hall.belt.defences === 1 ? "time" : "times"}`}
                    </small>
                  </span>
                </span>
              ) : (
                <b className="pa-hp-holder-none">Nobody holds it yet</b>
              )}
              <p>Beat the holder in any game and the Belt is yours.</p>
            </div>
          </section>

          <div className="pa-hp-lower">
            <Board
              rows={scope === "season" ? hall.board : hall.allTime}
              scope={scope}
              onScope={setScope}
              qualifying={scope === "season" ? hall.qualifying : []}
              lobby={lobby}
              me={me}
            />
            <Side hall={hall} tab={tab} onTab={setTab} lobby={lobby} me={me} />
          </div>
        </>
      )}
    </main>
  );
}

/**
 * Spec 0019 F3 — how the points work, behind an "i" by the Leaderboard
 * title: shown on hover or focus, and toggled by a click (a touch screen
 * has no hover). The page still fits one screen.
 */
function RatingHelp() {
  // Hover shows it while the pointer is there; a click pins it open (a touch
  // screen has no hover), and a second click or leaving the button closes it.
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;
  const tipId = useId();
  return (
    <span
      className="pa-hp-help"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className="pa-hp-help-button"
        aria-label="How ratings work"
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setPinned((now) => !now)}
        onBlur={() => setPinned(false)}
      >
        i
      </button>
      {open && (
        <span id={tipId} role="tooltip" className="pa-hp-help-tip">
          Everyone starts each season at 1000. A win adds points and a loss takes them away; beating
          a higher-rated player is worth more (up to 32), a lower-rated one less. A draw changes
          nothing. Five games in a season to be ranked.
        </span>
      )}
    </span>
  );
}

function Places({ places, lobby }: { places: HallPlace[]; lobby: LobbyState }) {
  return (
    <ol className="pa-hp-places">
      {PLACES.map((slot) => {
        const holder = places.find((p) => p.place === slot.place);
        return (
          <li
            key={slot.place}
            className={`pa-hp-place pa-hp-p${slot.place}${holder ? "" : " pa-hp-place-empty"}`}
          >
            <img className="pa-hp-cup" src={slot.trophy} alt="" width={96} height={96} />
            <span className="pa-hp-place-text">
              <span className="pa-hp-place-label">{slot.label}</span>
              {holder ? (
                <>
                  <span className="pa-hp-who">
                    <Avatar
                      avatar={avatarOf(lobby, holder.userId)}
                      size={SEAT_AVATAR}
                      rank={slot.rank}
                    />
                    <b title={nameIn(lobby, holder.userId)}>{nameIn(lobby, holder.userId)}</b>
                  </span>
                  <span className="pa-hp-stat">
                    {ratingText(holder.rating)} · {wonText(holder.wins, holder.games)}
                  </span>
                </>
              ) : (
                <span className="pa-hp-stat">Nobody yet</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Board({
  rows,
  scope,
  onScope,
  qualifying,
  lobby,
  me,
}: {
  rows: HallRow[];
  scope: "season" | "all";
  onScope: (scope: "season" | "all") => void;
  qualifying: { userId: string; games: number; wins: number }[];
  lobby: LobbyState;
  me: string | null;
}) {
  const headingId = useId();
  return (
    <section className="pa-panel pa-hp-board" aria-labelledby={headingId}>
      <div className="pa-hp-head">
        <h2 id={headingId}>Leaderboard</h2>
        <RatingHelp />
        <span className="pa-hp-seg" role="group" aria-label="Which games">
          <button type="button" aria-pressed={scope === "season"} onClick={() => onScope("season")}>
            This season
          </button>
          <button type="button" aria-pressed={scope === "all"} onClick={() => onScope("all")}>
            All time
          </button>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="pa-group-empty pa-hp-empty">
          Nobody is ranked yet: five finished games puts a player on the board.
        </p>
      ) : (
        <div className="pa-hp-table-wrap">
          <table className="pa-hp-table">
            <colgroup>
              <col className="pa-hp-c-rank" />
              <col />
              <col className="pa-hp-c-rating" />
              <col className="pa-hp-c-rec" />
              <col className="pa-hp-c-pct" />
              <col className="pa-hp-c-form" />
              <col className="pa-hp-c-deck" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Rating</th>
                <th scope="col">W · L · D</th>
                <th scope="col">Win %</th>
                <th scope="col">Last five</th>
                <th scope="col">Favourite deck</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.userId}
                  className={`pa-hp-r${Math.min(row.rank, 4)}${row.userId === me ? " pa-hp-me" : ""}`}
                >
                  <td className="pa-hp-rank">
                    {row.rank}
                    {row.move !== null && row.move !== 0 && (
                      <span
                        className={row.move > 0 ? "pa-hp-up" : "pa-hp-down"}
                        aria-label={row.move > 0 ? `up ${row.move}` : `down ${-row.move}`}
                      >
                        {row.move > 0 ? `▲${row.move}` : `▼${-row.move}`}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="pa-hp-player">
                      <Avatar avatar={avatarOf(lobby, row.userId)} size={ICON} />
                      <span className="pa-hp-player-text">
                        <b>{nameIn(lobby, row.userId)}</b>
                        {row.badges.length > 0 && (
                          <span className="pa-hp-badges">
                            {/* Spec 0019 — each badge says how it was earned. */}
                            {row.badges.map((badge) => (
                              <span
                                key={badge.key}
                                className={`pa-hp-badge pa-hp-badge-${badge.key}`}
                                title={badgeTip(badge)}
                              >
                                {badge.label}
                              </span>
                            ))}
                            {row.badges.length > 1 && (
                              // Where a row shows one badge only (laptop widths), the rest.
                              <span
                                className="pa-hp-badge pa-hp-badge-more"
                                title={row.badges
                                  .slice(1)
                                  .map((b) => `${b.label}: ${badgeTip(b)}`)
                                  .join("\n")}
                              >
                                +{row.badges.length - 1}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="pa-hp-rating">
                    {ratingText(row.rating)}
                    {row.change !== 0 && (
                      <small className={row.change > 0 ? "pa-hp-up" : "pa-hp-down"}>
                        {row.change > 0 ? `+${row.change}` : row.change}
                      </small>
                    )}
                  </td>
                  <td className="pa-hp-rec">
                    <b>{row.wins}</b> · <i>{row.losses}</i> · {row.draws}
                  </td>
                  <td>{winPercent(row)}%</td>
                  <td>
                    <span
                      className="pa-hp-form"
                      aria-label={`Last five: ${row.form.split("").join(" ")}`}
                    >
                      {row.form.split("").map((mark, index) => (
                        <span key={index} className={`pa-hp-form-${mark}`}>
                          {mark}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>
                    {row.deck && (
                      <span className="pa-hp-deck">
                        {/* The same size as the player's picture (owner 2026-10-28). */}
                        <DeckIcon name={iconOf(row.deck)} size={ICON} />
                        <span>{row.deck.name}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {qualifying.length > 0 && (
        <div className="pa-hp-foot">
          <span className="pa-hp-foot-label">Playing their way in · 5 games to be ranked</span>
          {qualifying.map((q) => (
            <span key={q.userId} className="pa-hp-q">
              <Avatar avatar={avatarOf(lobby, q.userId)} size={ICON} />
              {nameIn(lobby, q.userId)}
              <span className="pa-hp-bar" aria-hidden="true">
                <i style={{ width: `${(q.games / 5) * 100}%` }} />
              </span>
              {q.games} of 5
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Side({
  hall,
  tab,
  onTab,
  lobby,
  me,
}: {
  hall: Hall;
  tab: Tab;
  onTab: (tab: Tab) => void;
  lobby: LobbyState;
  me: string | null;
}) {
  const name = (userId: string | null | undefined) => nameIn(lobby, userId);
  return (
    <section className="pa-panel pa-hp-side" aria-label="Records and rivalries">
      <div className="pa-hp-tabs" role="tablist" aria-label="Records and rivalries">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="pa-hp-tab-body" role="tabpanel" aria-label={tab}>
        {tab === "Records" && (
          <ul className="pa-hp-list">
            {hall.records.length === 0 && <li className="pa-group-empty">No records yet.</li>}
            {hall.records.map((record) => (
              <li key={record.key}>
                <Avatar avatar={avatarOf(lobby, record.userId)} size={ICON} />
                <span className="pa-hp-what">
                  {record.label}
                  {/* One line; a long deck name ends in "…", whole in the tooltip. */}
                  <small
                    title={
                      record.key === "fastest-win" && record.detail
                        ? `${name(record.userId)}, ${record.detail}`
                        : undefined
                    }
                  >
                    {name(record.userId)}
                    {record.key === "fastest-win" && record.detail && `, ${record.detail}`}
                    {record.key === "longest-game" && ` beat ${name(record.detail)}`}
                  </small>
                </span>
                <span className="pa-hp-val">
                  {record.key === "fastest-win" || record.key === "longest-game"
                    ? `Turn ${record.value}`
                    : record.value}
                </span>
              </li>
            ))}
          </ul>
        )}
        {tab === "Rivalries" && (
          <ul className="pa-hp-list">
            {hall.rivalries.length === 0 && <li className="pa-group-empty">No games yet.</li>}
            {hall.rivalries.map((r) => (
              <li key={`${r.a}-${r.b}`} className="pa-hp-h2h">
                <span className="pa-hp-h2h-side">
                  <Avatar avatar={avatarOf(lobby, r.a)} size={ICON} />
                  {name(r.a)}
                </span>
                <span className="pa-hp-val">
                  {r.aWins} – {r.bWins}
                </span>
                <span className="pa-hp-h2h-side pa-hp-h2h-b">
                  {name(r.b)}
                  <Avatar avatar={avatarOf(lobby, r.b)} size={ICON} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {tab === "Latest" && (
          <ul className="pa-hp-list pa-hp-feed">
            {hall.latest.length === 0 && <li className="pa-group-empty">No games yet.</li>}
            {hall.latest.map((item) => (
              <li key={`${item.at}-${item.kind}`}>
                <span className="pa-hp-what">
                  {latestText(item, name)}
                  <small>
                    {new Date(item.at).toLocaleString("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
        {tab === "Past seasons" && (
          <ul className="pa-hp-list">
            {hall.past.length === 0 && (
              <li className="pa-group-empty">This is the first season.</li>
            )}
            {[...hall.past].reverse().map((season) => (
              <li key={season.month} className="pa-hp-past">
                <span className="pa-hp-what">
                  Season {season.number} · {monthName(season.month)}
                  <small>
                    {season.places.length === 0
                      ? "Nobody was ranked"
                      : season.places
                          .map((p) => `${PLACES[p.place - 1]!.label}: ${name(p.userId)}`)
                          .join(" · ")}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hall.rival && me && (
        <div className="pa-hp-rival">
          <span className="pa-hp-rival-label">Your rival</span>
          <span className="pa-hp-h2h">
            <span className="pa-hp-h2h-side">
              <Avatar avatar={avatarOf(lobby, me)} size={ICON} />
              You
            </span>
            <span className="pa-hp-val">
              {hall.rival.aWins} – {hall.rival.bWins}
            </span>
            <span className="pa-hp-h2h-side pa-hp-h2h-b">
              {name(hall.rival.b)}
              <Avatar avatar={avatarOf(lobby, hall.rival.b)} size={ICON} />
            </span>
          </span>
        </div>
      )}
    </section>
  );
}
