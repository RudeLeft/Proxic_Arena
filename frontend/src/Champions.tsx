// The Hall of Champions — spec 0011 (owner 2026-10-25).
//
// The lobby's panel of the top three by wins and dead last, with the
// owner's four trophies. The numbers are the server's (STANDINGS); this
// only draws them, joined to the names and pictures the Players list
// already has.

import trophyBronze from "./assets/trophies/trophy-bronze.webp";
import trophyGold from "./assets/trophies/trophy-gold.webp";
import trophyLast from "./assets/trophies/trophy-last.webp";
import trophySilver from "./assets/trophies/trophy-silver.webp";
import { Avatar } from "./avatars";
import type { LobbyState, Standing } from "./lobby";
import { avatarOf } from "./lobbyView";

const TROPHIES = [trophyGold, trophySilver, trophyBronze];

/** "1 win", "14 wins". */
export function winsText(wins: number): string {
  return `${wins} ${wins === 1 ? "win" : "wins"}`;
}

/** "from 1 game", "from 19 games". */
function gamesText(games: number): string {
  return `${games} ${games === 1 ? "game" : "games"}`;
}

export function HallOfChampions({ lobby }: { lobby: LobbyState }) {
  const standings = lobby.standings;
  // Nothing until the server has spoken, as the other lists.
  if (!standings) return null;
  const nameOf = (s: Standing) =>
    lobby.players.find((p) => p.userId === s.userId)?.displayName ?? "A player";
  const [champion, ...rest] = standings.podium;

  return (
    <section className="pa-panel pa-hall" aria-labelledby="hall-heading">
      <div className="pa-panel-head">
        <h2 id="hall-heading">Hall of Champions</h2>
        <span className="pa-panel-note">All-time wins</span>
      </div>
      {champion ? (
        <div className="pa-hall-body">
          <div className="pa-hall-reigning">
            <img className="pa-hall-cup" src={trophyGold} alt="" width={120} height={120} />
            <div className="pa-hall-reigning-text">
              <span className="pa-hall-title">Reigning Proxic Champion</span>
              <span className="pa-hall-name-row">
                <Avatar avatar={avatarOf(lobby, champion.userId)} size={56} rank={1} />
                <span className="pa-hall-name">{nameOf(champion)}</span>
              </span>
              <span className="pa-hall-record">
                {winsText(champion.wins)} from {gamesText(champion.games)}
              </span>
            </div>
          </div>
          {rest.length > 0 && (
            <ol className="pa-hall-podium" aria-label="Runners-up">
              {rest.map((s, index) => (
                <li key={s.userId} className="pa-hall-row">
                  <img
                    className="pa-hall-cup-small"
                    src={TROPHIES[index + 1]}
                    alt=""
                    width={52}
                    height={52}
                  />
                  <Avatar
                    avatar={avatarOf(lobby, s.userId)}
                    size={40}
                    rank={(index + 2) as 2 | 3}
                  />
                  <span className="pa-hall-who">
                    <span className="pa-hall-row-name">{nameOf(s)}</span>
                    <span className="pa-hall-row-sub">
                      {index === 0 ? "2nd" : "3rd"} · {gamesText(s.games)}
                    </span>
                  </span>
                  <span className="pa-hall-wins">
                    {s.wins}
                    <small>{s.wins === 1 ? "win" : "wins"}</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {standings.last && (
            <div className="pa-hall-row pa-hall-last">
              <img className="pa-hall-cup-small" src={trophyLast} alt="" width={52} height={52} />
              <Avatar avatar={avatarOf(lobby, standings.last.userId)} size={40} rank="last" />
              <span className="pa-hall-who">
                <span className="pa-hall-last-label">Dead last</span>
                <span className="pa-hall-row-name">{nameOf(standings.last)}</span>
              </span>
              <span className="pa-hall-wins">
                {standings.last.wins}
                <small>
                  {standings.last.wins === 1 ? "win" : "wins"} in {standings.last.games}
                </small>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="pa-hall-empty">
          <img className="pa-hall-cup-small" src={trophyGold} alt="" width={52} height={52} />
          <p>No champion yet. Win a game to take the crown.</p>
        </div>
      )}
    </section>
  );
}
