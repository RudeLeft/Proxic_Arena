// The Hall of Champions' data — spec 0018. GET /api/hall, read as-is;
// names and pictures come from the lobby's PLAYERS list, as the
// STANDINGS rings do, so the server sends players by id only.

export interface HallDeck {
  name: string;
  icon: string | null;
  colors: string | null;
}

/** 1, 2, 3, or 4 for Last place. */
export interface HallPlace {
  place: number;
  userId: string;
  rating: number;
  wins: number;
  games: number;
}

export interface HallSeason {
  number: number;
  /** "2026-11" */
  month: string;
  endsAt: string;
  places: HallPlace[];
}

export interface HallRow {
  userId: string;
  rank: number;
  move: number | null;
  rating: number;
  change: number;
  wins: number;
  losses: number;
  draws: number;
  form: string;
  badges: { key: string; label: string }[];
  deck: HallDeck | null;
}

export interface HallRecord {
  key: string;
  label: string;
  userId: string;
  value: number;
  detail: string;
}

export interface HallRivalry {
  a: string;
  b: string;
  aWins: number;
  bWins: number;
  draws: number;
}

export interface HallLatest {
  at: string;
  kind: "win" | "draw" | "belt";
  players: string[];
  turn: number | null;
  change: number | null;
  beltTaken: boolean;
}

export interface Hall {
  season: HallSeason;
  belt: { holder: string | null; since: string | null; defences: number };
  board: HallRow[];
  allTime: HallRow[];
  qualifying: { userId: string; games: number; wins: number }[];
  records: HallRecord[];
  rivalries: HallRivalry[];
  rival: HallRivalry | null;
  latest: HallLatest[];
  past: HallSeason[];
}

/** The Hall, or null when it could not be read. */
export async function fetchHall(fetchFn: typeof fetch = fetch): Promise<Hall | null> {
  try {
    const response = await fetchFn("/api/hall", { credentials: "same-origin" });
    if (!response.ok) return null;
    return (await response.json()) as Hall;
  } catch {
    return null;
  }
}

/** "2026-11" -> "November". */
export function monthName(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, number! - 1, 1)).toLocaleString("en", {
    month: "long",
    timeZone: "UTC",
  });
}

/** "12 days", "1 day", "5 hours" — how long the season has left. */
export function timeLeft(endsAt: string, now: number): string {
  const ms = Math.max(0, Date.parse(endsAt) - now);
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} ${days === 1 ? "day" : "days"}`;
  const hours = Math.max(1, Math.ceil(ms / 3_600_000));
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/** "Held 4 days", "Held today". */
export function heldFor(since: string | null, now: number): string {
  if (!since) return "";
  const days = Math.floor((now - Date.parse(since)) / 86_400_000);
  if (days < 1) return "Held since today";
  return `Held ${days} ${days === 1 ? "day" : "days"}`;
}

/** Spec 0019 — what a badge means, for its tooltip. */
export function badgeTip(badge: { key: string; label: string }): string {
  switch (badge.key) {
    case "belt":
      return "Holds the Champion's Belt right now.";
    case "on-fire": {
      const run = badge.label.match(/\d+/)?.[0] ?? "3";
      return `${run} wins in a row (a loss or a draw ends the run).`;
    }
    case "giant-slayer":
      return "Beat the player leading the season, this season.";
    case "speed-demon":
      return "Won a game by turn 5, this season.";
    case "never-conceded":
      return "10 or more games, and never conceded one.";
    case "deck-master":
      return "Won with 5 or more different decks.";
    default:
      return badge.label;
  }
}

/** "1,184" */
export const ratingText = (rating: number) => rating.toLocaleString("en");

/** "won 9 of 12" */
export const wonText = (wins: number, games: number) => `won ${wins} of ${games}`;

/** Win share, whole percent; draws count as games. */
export function winPercent(row: Pick<HallRow, "wins" | "losses" | "draws">): number {
  const games = row.wins + row.losses + row.draws;
  return games === 0 ? 0 : Math.round((row.wins * 100) / games);
}

/** One Latest line in words. */
export function latestText(item: HallLatest, name: (userId: string) => string): string {
  const [first = "", second = ""] = item.players;
  const turn = item.turn ? ` on turn ${item.turn}` : "";
  switch (item.kind) {
    case "draw":
      return `${name(first)} and ${name(second)} drew${turn}`;
    case "belt":
      return `${name(first)} took over the Belt: ${name(second)} hadn't played for 14 days`;
    default:
      return (
        `${name(first)} beat ${name(second)}${turn}` +
        (item.change ? ` · +${item.change}` : "") +
        (item.beltTaken ? " and took the Belt" : "")
      );
  }
}
