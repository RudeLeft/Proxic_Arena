// The Hall of Champions — spec 0011 (owner 2026-10-25), reshaped by
// spec 0016 (owner 2026-10-26).
//
// The top three by wins and dead last, with the owner's four trophies.
// Spec 0016: one strip across the top of the lobby, four equal places,
// every trophy at the champion's size, each record said the same way
// ("Won 6 of 9 games"), and no title: the trophies say what it is. The
// numbers are the server's (STANDINGS); this only draws them, joined to
// the names and pictures the Players list already has.

import trophyBronze from "./assets/trophies/trophy-bronze.webp";
import trophyGold from "./assets/trophies/trophy-gold.webp";
import trophyLast from "./assets/trophies/trophy-last.webp";
import trophySilver from "./assets/trophies/trophy-silver.webp";
import { Avatar } from "./avatars";
import type { LobbyState, Standing } from "./lobby";
import { avatarOf, type Rank } from "./lobbyView";

/** "Won 6 of 9 games", "Won 1 of 1 game" — the one way every place says it. */
export function recordText(wins: number, games: number): string {
  return `Won ${wins} of ${games} ${games === 1 ? "game" : "games"}`;
}

/** The trophies' one size: the champion's, never shrunk (owner 2026-10-26). */
const TROPHY = 120;

const PLACES: { rank: Rank; label: string; trophy: string }[] = [
  { rank: 1, label: "Reigning Proxic Champion", trophy: trophyGold },
  { rank: 2, label: "2nd place", trophy: trophySilver },
  { rank: 3, label: "3rd place", trophy: trophyBronze },
  { rank: "last", label: "Dead last", trophy: trophyLast },
];

export function HallOfChampions({ lobby }: { lobby: LobbyState }) {
  const standings = lobby.standings;
  // Nothing until the server has spoken, as the other lists.
  if (!standings) return null;
  const nameOf = (s: Standing) =>
    lobby.players.find((p) => p.userId === s.userId)?.displayName ?? "A player";
  const holders: (Standing | null)[] = [
    standings.podium[0] ?? null,
    standings.podium[1] ?? null,
    standings.podium[2] ?? null,
    standings.last,
  ];

  return (
    <section className="pa-panel pa-hall" aria-label="Hall of Champions">
      {holders[0] ? (
        <ol className="pa-hall-strip">
          {PLACES.map((place, index) => {
            const holder = holders[index];
            return (
              <li
                key={place.label}
                className={`pa-hall-place${holder ? "" : " pa-hall-place-empty"}${index === 0 ? " pa-hall-first" : ""}`}
              >
                <img
                  className="pa-hall-cup"
                  src={place.trophy}
                  alt=""
                  width={TROPHY}
                  height={TROPHY}
                />
                <span className="pa-hall-text">
                  <span className="pa-hall-label">{place.label}</span>
                  {holder ? (
                    <>
                      <span className="pa-hall-name-row">
                        <Avatar
                          avatar={avatarOf(lobby, holder.userId)}
                          size={40}
                          rank={place.rank}
                        />
                        <span className="pa-hall-name">{nameOf(holder)}</span>
                      </span>
                      <span className="pa-hall-record">
                        {recordText(holder.wins, holder.games)}
                      </span>
                    </>
                  ) : (
                    <span className="pa-hall-record">Nobody yet</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="pa-hall-empty">
          <img className="pa-hall-cup" src={trophyGold} alt="" width={TROPHY} height={TROPHY} />
          <p>No champion yet. Win a game to take the crown.</p>
        </div>
      )}
    </section>
  );
}
