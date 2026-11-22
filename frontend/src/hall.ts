// The Hall of Champions' data — spec 0018. GET /api/hall, read as-is;
// names come from the lobby's PLAYERS list, as the STANDINGS rings do, so
// the server sends players by id only -- and, since P11-E2, each one's
// avatar name beside them (`avatars`), so the faces don't wait for that list.

import { learnAvatars } from "./knownAvatars";
import { capital, countWords, numberWord } from "./words";

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
  belt: {
    holder: string | null;
    since: string | null;
    defences: number;
    /** Spec 0048 — when the holder must finish a game by; null with no holder. */
    defendBy?: string | null;
    /** Spec 0048 — the rule's days (7). */
    idleDays?: number;
  };
  board: HallRow[];
  allTime: HallRow[];
  qualifying: { userId: string; games: number; wins: number }[];
  records: HallRecord[];
  rivalries: HallRivalry[];
  rival: HallRivalry | null;
  latest: HallLatest[];
  past: HallSeason[];
  /**
   * P11-E2 — the avatar of each player the Hall names who is still an active
   * account (null: the default picture), so their faces are right before the
   * lobby's list arrives. Names still come from that list.
   */
  avatars?: Record<string, string | null>;
}

/** The Hall, or null when it could not be read. */
export async function fetchHall(fetchFn: typeof fetch = fetch): Promise<Hall | null> {
  try {
    const response = await fetchFn("/api/hall", { credentials: "same-origin" });
    if (!response.ok) return null;
    const hall = (await response.json()) as Hall;
    learnAvatars(Object.entries(hall.avatars ?? {}));
    return hall;
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

/** "12 days", "one day", "five hours" — how long the season has left (spec 0114 W2-068). */
export function timeLeft(endsAt: string, now: number): string {
  const ms = Math.max(0, Date.parse(endsAt) - now);
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return countWords(days, "day");
  const hours = Math.max(1, Math.ceil(ms / 3_600_000));
  return countWords(hours, "hour");
}

/** "Held for four days", "Held since today". */
export function heldFor(since: string | null, now: number): string {
  if (!since) return "";
  const days = Math.floor((now - Date.parse(since)) / 86_400_000);
  if (days < 1) return "Held since today";
  return `Held for ${countWords(days, "day")}`;
}

/** Spec 0048 — the rule's days when the server does not say (it always does). */
export const BELT_DAYS = 7;

/** Spec 0048 — the holder is reminded in the lobby this close to the date. */
export const REMIND_MS = 2 * 86_400_000;

/** "Sat, Nov 8" (spec 0114 W2-155: the American order the Deck Depot uses). */
export function shortDate(at: string): string {
  return new Date(at).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Spec 0048 — "Defend by Sat, Nov 8 · four days left". */
export function defendText(defendBy: string, now: number): string {
  const ms = Date.parse(defendBy) - now;
  const left = ms <= 0 ? "due now" : `${timeLeft(defendBy, now)} left`;
  return `Defend by ${shortDate(defendBy)} · ${left}`;
}

/** Spec 0048 — how much of the holder's time is left, 0..1, for the bar. */
export function defendShare(defendBy: string, now: number, days: number = BELT_DAYS): number {
  const ms = Date.parse(defendBy) - now;
  return Math.min(1, Math.max(0, ms / (days * 86_400_000)));
}

/** Spec 0048 — whether the holder should be reminded now (2 days or less to go). */
export function remindHolder(defendBy: string | null | undefined, now: number): boolean {
  return !!defendBy && Date.parse(defendBy) - now <= REMIND_MS;
}

/**
 * Spec 0114 (W2-151) -- a badge's name on its chip: "On Fire", never the run
 * the server writes after it ("On Fire: six wins in a row"), which the
 * tooltip says ({@link badgeTip}). Keeps the chip as short as it was.
 */
export function badgeName(badge: { label: string }): string {
  return badge.label.split(/:| · /)[0]!.trim();
}

/** Spec 0019 — what a badge means, for its tooltip. */
export function badgeTip(badge: { key: string; label: string }): string {
  switch (badge.key) {
    case "belt":
      return "Holds the Champion's Belt right now.";
    case "on-fire": {
      return `${capital(numberWord(runOf(badge.label)))} wins in a row (a loss or a draw ends the run).`;
    }
    case "giant-slayer":
      return "Beat the player leading the season, this season.";
    case "speed-demon":
      return "Won a game by turn five this season.";
    case "never-conceded":
      return "Played ten or more games and never conceded one.";
    case "deck-master":
      return "Won with five or more different decks.";
    default:
      return badge.label;
  }
}

/** "1,184" */
export const ratingText = (rating: number) => rating.toLocaleString("en");

/** "won nine of 12", "won three of five" */
export const wonText = (wins: number, games: number) =>
  `won ${numberWord(wins)} of ${numberWord(games)}`;

/**
 * The run in an On Fire badge's label, whether the server writes it in
 * digits ("On Fire · 5") or words ("On Fire: five wins in a row"); three,
 * the badge's least, when it says neither.
 */
function runOf(label: string): number {
  const digits = label.match(/\d+/)?.[0];
  if (digits) return Number(digits);
  const words = label.toLowerCase().split(/[^a-z]+/);
  for (let n = 10; n >= 0; n--) if (words.includes(numberWord(n))) return n;
  return 3;
}

/** Win share, whole percent; draws count as games. */
export function winPercent(row: Pick<HallRow, "wins" | "losses" | "draws">): number {
  const games = row.wins + row.losses + row.draws;
  return games === 0 ? 0 : Math.round((row.wins * 100) / games);
}

/** One Latest line in words. */
export function latestText(
  item: HallLatest,
  name: (userId: string) => string,
  idleDays: number = BELT_DAYS,
): string {
  const [first = "", second = ""] = item.players;
  const turn = item.turn ? ` on turn ${numberWord(item.turn)}` : "";
  switch (item.kind) {
    case "draw":
      return `${name(first)} and ${name(second)} drew${turn}`;
    case "belt":
      return `${name(first)} took over the Belt: ${name(second)} hadn't played for ${countWords(idleDays, "day")}`;
    default:
      // Spec 0114 W2-075: the rating change at the end, not wedged mid-sentence.
      return (
        `${name(first)} beat ${name(second)}${turn}` +
        (item.beltTaken ? " and took the Belt" : "") +
        (item.change ? ` (+${item.change})` : "")
      );
  }
}

/** Spec 0114 W2-063: "Up two places", "Down one place". */
export function moveWords(move: number): string {
  return `${move > 0 ? "Up" : "Down"} ${countWords(Math.abs(move), "place")}`;
}

const FORM_WORDS: Record<string, string> = { W: "won", L: "lost", D: "drawn" };

/** Spec 0114 W2-066: "won, lost, drawn, won, won" for "WLDWW". */
export function formWords(form: string): string {
  return form
    .split("")
    .map((mark) => FORM_WORDS[mark] ?? mark)
    .join(", ");
}

/** Spec 0114 W2-067: "three wins to one", "one win to two" (said aloud). */
export function winsTo(a: number, b: number): string {
  return `${countWords(a, "win")} to ${numberWord(b)}`;
}

/** Spec 0114 W2-058: "every seven days", "every day". */
export function everyDays(days: number): string {
  return days === 1 ? "day" : countWords(days, "day");
}
