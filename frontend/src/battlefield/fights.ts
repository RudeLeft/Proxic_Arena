// Combat damage, one fight at a time -- Phase 10 A-13 (owner 2026-11-06,
// PHASE_10_ANIMATION_LOCKED.md Amendment 15, "B2 · Claw slash").
//
// Pure, like layout() and motion.ts: from what the game says a combat
// damage step dealt (the damage wave's `fights`, `hits` and `gains`) and
// where each card stands, the fights in order, when each one plays, how
// each fighter moves, and where the slash marks, numbers and flashes go.
// The Board only applies it. Nothing here decides who fought whom or what
// was dealt: that is the game's, word for word (ARCH-002).
//
// One fight at a time: each attacker with its blockers, then each unblocked
// attacker against the player (or planeswalker, or battle) it attacks. The
// rest of the table is dimmed and a caption says who fights. The fighters
// rear back and lunge so they meet edge to edge -- never overlapping; each
// hit rips three glowing slash marks across the card it strikes, with a red
// flash on it, sparks, a small shake, and knocks it back; the numbers slash
// in. An unblocked attacker lunges at the player's plate. They step back;
// after a beat the dead shatter (A-04) and the next fight begins.

import type { Box } from "./layout";
import type { Point } from "./motion";

/** What a hit or a fight points at: a permanent, or a player. */
export type FightRef = { object: string } | { player: number };

/** A combat damage step's wave, as the game sends it (protocol/README.md, B13 + Phase 10 A-13). */
export interface CombatWave {
  key: string;
  hits: readonly {
    source: string;
    target: FightRef;
    amount: number;
    deathtouch?: boolean;
    /** Spec 0077 -- poison counters, not life. */
    infect?: boolean;
    /** Spec 0080 -- damage a prevention stopped (Holy Day, protection): its would-be amount (`amount` 0). */
    prevented?: number;
  }[];
  combat?: "first-strike" | "regular";
  /** Spec 0084 -- a fight or bite spell's damage: `fights` in a combat step's shape. */
  fight?: boolean;
  fights?: readonly { attacker: string; defender: FightRef; blockers: readonly string[] }[];
  gains?: readonly { player: number; amount: number; source?: string }[];
}

// --- timing (the canvas's B2, in milliseconds) ---------------------------------

/** A fight between an attacker and its blockers. */
export const FIGHT_FOCUS_MS = 250; // the table dims to this fight
export const FIGHT_REAR_MS = 300; // they rear back
export const FIGHT_LUNGE_MS = 170; // and lunge, meeting edge to edge
export const FIGHT_SECOND_MS = 120; // the attacker's own slashes, after the blockers'
export const FIGHT_KNOCK_MS = 420; // knocked back
export const FIGHT_BACK_MS = 260; // step back to their places
export const FIGHT_BEAT_MS = 450; // a beat, then the dead shatter
/** The next fight starts as the dead have cracked (A-04's shake and crack). */
export const FIGHT_CRACKED_MS = 520;
/** An unblocked attacker at a player, planeswalker or battle. */
export const STRIKE_REAR_MS = 260;
export const STRIKE_LUNGE_MS = 240;
export const STRIKE_HOLD_MS = 120;
export const STRIKE_BACK_MS = 480;
export const STRIKE_AFTER_MS = 150;
/** The last fight's end to the table's light coming back. */
export const FIGHTS_FADE_MS = 250;
/** The slash marks (three, 60 ms apart), the number, the screen's red edge. */
export const SLASH_MS = 650;
export const SLASH_GAP_MS = 60;
export const SLASH_NUMBER_MS = 1400;
export const HURT_EDGE_MS = 700;
/**
 * Many fights speed up together so a big combat stays readable without
 * holding the table for long: past FIGHTS_MAX_MS in all, every time is
 * scaled down, to at most FIGHTS_FASTEST of it.
 */
export const FIGHTS_MAX_MS = 8000;
export const FIGHTS_FASTEST = 0.3;

// --- distances (of the card's height) and looks --------------------------------

export const FIGHT_REAR = 0.19;
export const FIGHT_KNOCK = 0.18;
/** How bright a fighter is while another fight plays (the table is dimmed as much). */
export const FIGHT_DIMMED = 0.4;
/** The dimming over the rest of the table (black, at this opacity). */
export const FIGHT_DIM = 0.6;
const RED = { bright: 1.8, sepia: 1, hue: -50, saturate: 4 };
/** A tapped card's tilt (layout's TAPPED_TILT): its corners reach this far below its box. */
const TILT_RAD = (5 * Math.PI) / 180;

// --- the plan ------------------------------------------------------------------

/** A pose of a fighter, relative to where it stands, in screen pixels. */
export interface Pose {
  at: number;
  dx: number;
  dy: number;
  r: number;
  s: number;
  /** 0 = its own light, 1 = flashing red. */
  red: number;
  /** Its brightness (FIGHT_DIMMED while another fight plays). */
  bright: number;
  /** How it eases from this pose to the next (a CSS easing). */
  easing?: string;
}

/** Something hit: a card (its box at the moment of impact) or a player (the plate). */
export interface Strike {
  /** The drawn card hit, or "player:N". */
  target: string;
  box?: Box;
  point?: Point;
  amount: number;
  deathtouch: boolean;
  /** Spec 0077 -- an infect hit on a player: poison counters, not life. */
  poison?: boolean;
  /** Spec 0080 -- the damage a prevention stopped here (the shield absorbs it; `amount` is what got through). */
  prevented?: number;
  /** When it lands, from the sequence's start. */
  at: number;
}

export interface PlannedFight {
  /** The attacker's drawn card: the fight's key. */
  attacker: string;
  blockers: string[];
  defender: FightRef;
  caption: string;
  start: number;
  /** When the blows land. */
  impact: number;
  /** When the dead shatter. */
  shatterAt: number;
  end: number;
  /** Where the fighters meet: the sparks. */
  contact: Point;
  strikes: Strike[];
  gains: { player: number; amount: number; at: number }[];
  /** Every drawn card in this fight, and its poses. */
  moves: Map<string, Pose[]>;
}

export interface FightPlan {
  key: string;
  firstStrike: boolean;
  fights: PlannedFight[];
  /** The whole of it, from its start to the table's light back. */
  total: number;
  /** 1, or less when many fights were sped up together. */
  speed: number;
  /** Every drawn card that fights, and the fight it fights in. */
  fighters: Map<string, number>;
  /** Life gained with no source the game could name: shown at the last blow. */
  unsourced: { player: number; amount: number; at: number }[];
}

/** A drawn card as the plan needs it: where it stands and what it is. */
export interface Stand {
  box: Box;
  /** The drawn card (a pile's lead) this object is drawn as. */
  item: string;
  name: string;
  seat: number;
  /** How many objects that drawn card stands for. */
  count: number;
}

export interface FightInput {
  wave: CombatWave;
  /** Where an object stands now -- as drawn before this update, so the dead too. */
  at: (id: string) => Stand | null;
  /** A player's life total on the plate. */
  life: (seat: number) => Point;
  /** The plate's ring radius: a lunge stops at it. */
  lifeR: number;
  /**
   * Spec 0077 -- a player's poison badge, and its radius: an infect hit
   * lands there, never on the life shield (poison is not life).
   */
  poison?: (seat: number) => Point;
  poisonR?: number;
  viewerSeat: number;
  opponentName: string;
  /** Spec 0067 -- a spectator's board: the bottom player's name, said instead of "you"/"your". */
  viewerName?: string | null;
}

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const shifted = (b: Box, dx: number, dy: number): Box => ({ ...b, x: b.x + dx, y: b.y + dy });
/** How far a card's tilt pushes its corners past its box's top or bottom. */
const tiltReach = (b: Box) => (b.rotation ? (b.w / 2) * Math.sin(TILT_RAD) + 1 : 1);

/** "two Grizzly Bears", "Grizzly Bears and Llanowar Elves". */
function listOf(cards: readonly Stand[]): string {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.name, (counts.get(c.name) ?? 0) + c.count);
  const words = [...counts].map(([name, n]) =>
    n === 1 ? name : `${n === 2 ? "two" : n === 3 ? "three" : String(n)} ${name}`,
  );
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * What a fight's caption says, in a player's words: "Damage · the Hill Giant
 * against your two Grizzly Bears", "Damage · Bob's Grizzly Bears hit you",
 * "First strike · your White Knight against their Grizzly Bears".
 */
export function captionOf(
  attacker: Stand,
  blockers: readonly Stand[],
  defender: { player: number } | Stand,
  viewerSeat: number,
  opponentName: string,
  firstStrike: boolean,
  viewerName: string | null = null,
): string {
  const lead = firstStrike ? "First strike" : "Damage";
  const many = attacker.count > 1 ? `${attacker.count} ` : "";
  // Spec 0067 -- a spectator is nobody's "you": every side by name.
  if (viewerName) {
    const nameOf = (seat: number) => (seat === viewerSeat ? viewerName : opponentName);
    const who = `${nameOf(attacker.seat)}'s ${many}${attacker.name}`;
    if (blockers.length > 0) {
      return `${lead} · ${who} against ${nameOf(blockers[0]!.seat)}'s ${listOf(blockers)}`;
    }
    if ("player" in defender) return `${lead} · ${who} hit ${nameOf(defender.player)}`;
    const theirs = /^The /.test(defender.name) ? "" : `${nameOf(defender.seat)}'s `;
    return `${lead} · ${who} hit ${theirs}${defender.name}`;
  }
  const mine = attacker.seat === viewerSeat;
  if (blockers.length > 0) {
    const whose = blockers[0]!.seat === viewerSeat ? "your" : "their";
    return `${lead} · ${mine ? "your" : "the"} ${many}${attacker.name} against ${whose} ${listOf(blockers)}`;
  }
  const who = mine ? `your ${many}${attacker.name}` : `${opponentName}'s ${many}${attacker.name}`;
  if ("player" in defender) {
    return `${lead} · ${who} hit ${defender.player === viewerSeat ? "you" : opponentName}`;
  }
  // "your Jace", but "The Wandering Emperor" as it is.
  const whose = /^The /.test(defender.name)
    ? ""
    : defender.seat === viewerSeat
      ? "your "
      : "their ";
  return `${lead} · ${who} hit ${whose}${defender.name}`;
}

const still = (at: number, bright = 1): Pose => ({ at, dx: 0, dy: 0, r: 0, s: 1, red: 0, bright });
/** The small shake as a blow lands: a jolt sideways, already flashing red. */
const SHAKE = 0.03; // of the card's height
const jolt = (at: number, from: { dx: number; dy: number }, h: number, side: number): Pose => ({
  at,
  dx: from.dx + side * SHAKE * h,
  dy: from.dy,
  r: 0,
  s: 1,
  red: 1,
  bright: 1,
});

/**
 * The fights of one combat damage step's wave, in order, timed from the
 * sequence's start: each attacker with its blockers first, then each
 * unblocked attacker. One fight per drawn card (a pile of attacking tokens
 * fights as one). A fight in which nothing was dealt is left out. Null when
 * the wave is not a combat step's or nothing in it can be drawn.
 */
export function planFights(input: FightInput): FightPlan | null {
  const { wave } = input;
  if (!(wave.combat || wave.fight) || !wave.fights || wave.fights.length === 0) return null;
  const itemOf = (id: string) => input.at(id)?.item ?? null;

  // Group the game's fights by the drawn card that attacks.
  type Group = { attacker: string; blockers: string[]; defender: FightRef; ids: Set<string> };
  const groups = new Map<string, Group>();
  for (const f of wave.fights) {
    const item = itemOf(f.attacker);
    if (!item) continue;
    const group = groups.get(item) ?? {
      attacker: item,
      blockers: [],
      defender: f.defender,
      ids: new Set<string>(),
    };
    group.ids.add(f.attacker);
    for (const b of f.blockers) {
      group.ids.add(b);
      const bi = itemOf(b);
      if (bi && !group.blockers.includes(bi)) group.blockers.push(bi);
    }
    groups.set(item, group);
  }
  // Each hit belongs to the fight its source fights in.
  const fightOf = new Map<string, Group>();
  for (const group of groups.values()) for (const id of group.ids) fightOf.set(id, group);
  const hitsOf = new Map<Group, CombatWave["hits"][number][]>();
  for (const hit of wave.hits) {
    const group = fightOf.get(hit.source);
    if (!group) continue;
    hitsOf.set(group, [...(hitsOf.get(group) ?? []), hit]);
  }
  const ordered = [...groups.values()].filter((g) => (hitsOf.get(g)?.length ?? 0) > 0);
  ordered.sort((a, b) => Number(a.blockers.length === 0) - Number(b.blockers.length === 0));
  if (ordered.length === 0) return null;

  // First at full speed, to see how long it all is; then scaled if too long.
  const raw = ordered.reduce((n, g) => n + rawLength(g.blockers.length > 0, true), 0);
  const speed = Math.max(FIGHTS_FASTEST, Math.min(1, FIGHTS_MAX_MS / Math.max(1, raw)));
  const k = (ms: number) => ms * speed;

  const fights: PlannedFight[] = [];
  const fighters = new Map<string, number>();
  const sources = new Set((wave.gains ?? []).flatMap((g) => (g.source ? [g.source] : [])));
  let t = 0;
  for (const group of ordered) {
    const a = input.at(group.attacker);
    if (!a) continue;
    const hits = hitsOf.get(group)!;
    const blockers = group.blockers.flatMap((id) => {
      const s = input.at(id);
      return s ? [{ id, ...s }] : [];
    });
    const defenderCard = "object" in group.defender ? input.at(group.defender.object) : null;
    const defender: { player: number } | Stand =
      "player" in group.defender ? group.defender : (defenderCard ?? { player: input.viewerSeat });
    const caption = captionOf(
      a,
      blockers,
      defender,
      input.viewerSeat,
      input.opponentName,
      wave.combat === "first-strike",
      input.viewerName ?? null,
    );
    const moves = new Map<string, Pose[]>();
    const strikes: Strike[] = [];
    const start = t;
    let impact: number;
    let end: number;
    let contact: Point;
    // The struck, by drawn card or player: how much, and whether by deathtouch.
    const struck = new Map<
      string,
      { amount: number; deathtouch: boolean; infect: boolean; ref: FightRef; prevented: number }
    >();
    for (const hit of hits) {
      const key =
        "player" in hit.target ? `player:${hit.target.player}` : itemOf(hit.target.object);
      if (!key) continue;
      const was = struck.get(key) ?? {
        amount: 0,
        deathtouch: false,
        infect: false,
        ref: hit.target,
        prevented: 0,
      };
      struck.set(key, {
        amount: was.amount + hit.amount,
        deathtouch: was.deathtouch || hit.deathtouch === true,
        infect: was.infect || hit.infect === true,
        ref: hit.target,
        prevented: was.prevented + (hit.prevented ?? 0),
      });
    }
    const A = a.box;
    const ac = centre(A);
    if (blockers.length > 0) {
      // Toward the blockers: they stand facing it, across the middle.
      const bc = blockers.map((b) => centre(b.box));
      const below = bc.reduce((n, c) => n + c.y, 0) / bc.length > ac.y;
      const v = below ? 1 : -1;
      const near = below
        ? Math.min(...blockers.map((b) => b.box.y))
        : Math.max(...blockers.map((b) => b.box.y + b.box.h));
      const edgeA = below ? A.y + A.h : A.y;
      const gap = Math.max(0, (near - edgeA) * v);
      const meetX = bc.reduce((n, c) => n + c.x, 0) / bc.length;
      // They meet halfway: the attacker's edge and theirs, never past.
      const aLunge = { dx: meetX - ac.x, dy: v * Math.max(0, gap / 2 - tiltReach(A)) };
      const at0 = k(FIGHT_FOCUS_MS);
      const at1 = at0 + k(FIGHT_REAR_MS);
      impact = start + at1 + k(FIGHT_LUNGE_MS);
      const second = impact + k(FIGHT_SECOND_MS);
      const knocked = second + k(FIGHT_KNOCK_MS);
      const back = knocked + k(FIGHT_BACK_MS);
      end = back + k(FIGHT_BEAT_MS);
      contact = { x: meetX, y: edgeA + v * (gap / 2) };
      const h = A.h;
      const aStruck = struck.get(group.attacker);
      moves.set(group.attacker, [
        still(start),
        { ...still(start + at0), easing: "cubic-bezier(.45,0,.25,1)" },
        {
          at: start + at1,
          dx: 0,
          dy: -v * FIGHT_REAR * h,
          r: -3 * v,
          s: 1.06,
          red: 0,
          bright: 1,
          easing: "cubic-bezier(.6,0,1,.6)",
        },
        { at: impact, ...aLunge, r: 0, s: 1, red: 0, bright: 1 },
        {
          at: second,
          ...aLunge,
          r: 0,
          s: 1,
          red: 0,
          bright: 1,
          easing: "cubic-bezier(.2,.8,.3,1)",
        },
        ...(aStruck && aStruck.amount > 0
          ? [
              jolt(second + k(FIGHT_KNOCK_MS) * 0.1, aLunge, h, 1),
              {
                at: second + k(FIGHT_KNOCK_MS) * 0.3,
                dx: aLunge.dx,
                dy: aLunge.dy - v * FIGHT_KNOCK * h,
                r: -4 * v,
                s: 1,
                red: 1,
                bright: 1,
                easing: "cubic-bezier(.2,.8,.3,1)",
              },
            ]
          : []),
        {
          at: knocked,
          ...aLunge,
          r: 0,
          s: 1,
          red: 0,
          bright: 1,
          easing: "cubic-bezier(.45,0,.25,1)",
        },
        still(back),
        still(end),
      ]);
      if (aStruck) {
        strikes.push({
          target: group.attacker,
          box: shifted(A, aLunge.dx, aLunge.dy),
          amount: aStruck.amount,
          deathtouch: aStruck.deathtouch,
          ...(aStruck.prevented > 0 ? { prevented: aStruck.prevented } : {}),
          at: second,
        });
      }
      blockers.forEach((b, i) => {
        const bl = { dx: 0, dy: -v * Math.max(0, gap / 2 - tiltReach(b.box)) };
        const hit = struck.get(b.id);
        const turn = i % 2 === 0 ? 3 : -3;
        moves.set(b.id, [
          still(start),
          { ...still(start + at0), easing: "cubic-bezier(.45,0,.25,1)" },
          {
            at: start + at1,
            dx: 0,
            dy: v * FIGHT_REAR * 0.85 * b.box.h,
            r: turn * v,
            s: 1.04,
            red: 0,
            bright: 1,
            easing: "cubic-bezier(.6,0,1,.6)",
          },
          { at: impact, ...bl, r: 0, s: 1, red: 0, bright: 1, easing: "cubic-bezier(.2,.8,.3,1)" },
          ...(hit && hit.amount > 0
            ? [
                jolt(impact + k(FIGHT_KNOCK_MS) * 0.1, bl, b.box.h, i % 2 === 0 ? -1 : 1),
                {
                  at: impact + k(FIGHT_KNOCK_MS) * 0.3,
                  dx: 0,
                  dy: bl.dy + v * FIGHT_KNOCK * b.box.h,
                  r: 4 * v * (i % 2 === 0 ? 1 : -1),
                  s: 1,
                  red: 1,
                  bright: 1,
                  easing: "cubic-bezier(.2,.8,.3,1)",
                },
              ]
            : []),
          { at: impact + k(FIGHT_KNOCK_MS), ...bl, r: 0, s: 1, red: 0, bright: 1 },
          {
            at: knocked,
            ...bl,
            r: 0,
            s: 1,
            red: 0,
            bright: 1,
            easing: "cubic-bezier(.45,0,.25,1)",
          },
          still(back),
          still(end),
        ]);
        if (hit) {
          strikes.push({
            target: b.id,
            box: shifted(b.box, bl.dx, bl.dy),
            amount: hit.amount,
            deathtouch: hit.deathtouch,
            ...(hit.prevented > 0 ? { prevented: hit.prevented } : {}),
            at: impact,
          });
        }
      });
    } else {
      // Unblocked: at the player's plate, or the planeswalker or battle it attacks.
      const at0 = k(FIGHT_FOCUS_MS);
      const at1 = at0 + k(STRIKE_REAR_MS);
      impact = start + at1 + k(STRIKE_LUNGE_MS);
      const held = impact + k(STRIKE_HOLD_MS);
      const back = held + k(STRIKE_BACK_MS);
      end = back + k(STRIKE_AFTER_MS);
      let lunge: { dx: number; dy: number };
      let rear: { dx: number; dy: number };
      if ("object" in group.defender && defenderCard) {
        const P = defenderCard.box;
        const pc = centre(P);
        const v = pc.y > ac.y ? 1 : -1;
        const edgeA = v > 0 ? A.y + A.h : A.y;
        const edgeP = v > 0 ? P.y : P.y + P.h;
        lunge = {
          dx: pc.x - ac.x,
          dy: v * Math.max(0, (edgeP - edgeA) * v - tiltReach(A) - tiltReach(P)),
        };
        rear = { dx: 0, dy: -v * FIGHT_REAR * A.h };
        contact = { x: pc.x, y: edgeP };
        moves.set(defenderCard.item, [
          still(start),
          still(impact),
          ...((struck.get(defenderCard.item)?.amount ?? 0) > 0
            ? [
                jolt(impact + k(FIGHT_KNOCK_MS) * 0.1, { dx: 0, dy: 0 }, P.h, 1),
                {
                  at: impact + k(FIGHT_KNOCK_MS) * 0.3,
                  dx: 0,
                  dy: v * FIGHT_KNOCK * P.h,
                  r: 4 * v,
                  s: 1,
                  red: 1,
                  bright: 1,
                  easing: "cubic-bezier(.2,.8,.3,1)",
                },
              ]
            : []),
          still(impact + k(FIGHT_KNOCK_MS)),
          still(end),
        ]);
        const hit = struck.get(defenderCard.item);
        if (hit) {
          strikes.push({
            target: defenderCard.item,
            box: P,
            amount: hit.amount,
            deathtouch: hit.deathtouch,
            ...(hit.prevented > 0 ? { prevented: hit.prevented } : {}),
            at: impact,
          });
        }
      } else {
        const seat = "player" in group.defender ? group.defender.player : input.viewerSeat;
        // Spec 0077: an infect attacker strikes the poison badge.
        const infects = struck.get(`player:${seat}`)?.infect === true && !!input.poison;
        const p = infects ? input.poison!(seat) : input.life(seat);
        const ringR = infects ? (input.poisonR ?? input.lifeR * 0.7) : input.lifeR;
        const dx = p.x - ac.x;
        const dy = p.y - ac.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        // Its near edge on the ring, never over the life total.
        const stop = Math.abs(dx / len) * (A.w / 2) + Math.abs(dy / len) * (A.h / 2) + ringR + 2;
        lunge = { dx: dx - (dx / len) * stop, dy: dy - (dy / len) * stop };
        rear = { dx: -(dx / len) * FIGHT_REAR * 0.5 * A.h, dy: -(dy / len) * FIGHT_REAR * A.h };
        contact = { x: p.x - (dx / len) * ringR, y: p.y - (dy / len) * ringR };
      }
      const tilt = lunge.dx >= 0 ? 1 : -1;
      moves.set(group.attacker, [
        still(start),
        { ...still(start + at0), easing: "cubic-bezier(.45,0,.25,1)" },
        {
          at: start + at1,
          ...rear,
          r: -4 * tilt,
          s: 1.08,
          red: 0,
          bright: 1,
          easing: "cubic-bezier(.6,0,1,.6)",
        },
        { at: impact, ...lunge, r: 8 * tilt, s: 1.08, red: 0, bright: 1 },
        {
          at: held,
          ...lunge,
          r: 8 * tilt,
          s: 1.08,
          red: 0,
          bright: 1,
          easing: "cubic-bezier(.45,0,.25,1)",
        },
        still(back),
        still(end),
      ]);
    }
    // Players hit -- unblocked, or trample's excess -- in this fight.
    for (const [key, s] of struck) {
      if (!("player" in s.ref)) continue;
      strikes.push({
        target: key,
        point: s.infect && input.poison ? input.poison(s.ref.player) : input.life(s.ref.player),
        amount: s.amount,
        deathtouch: false,
        ...(s.infect ? { poison: true } : {}),
        ...(s.prevented > 0 ? { prevented: s.prevented } : {}),
        at: impact,
      });
    }
    const gains = (wave.gains ?? []).flatMap((g) =>
      g.source && group.ids.has(g.source)
        ? [{ player: g.player, amount: g.amount, at: impact }]
        : [],
    );
    const fight: PlannedFight = {
      attacker: group.attacker,
      blockers: blockers.map((b) => b.id),
      defender: group.defender,
      caption,
      start,
      impact,
      shatterAt: end,
      end,
      contact,
      strikes,
      gains,
      moves,
    };
    fights.push(fight);
    for (const item of moves.keys()) if (!fighters.has(item)) fighters.set(item, fights.length - 1);
    // The next fight starts once this one's dead have cracked.
    const dies = blockers.length > 0 || "object" in group.defender;
    t = end + (dies ? k(FIGHT_CRACKED_MS) : 0);
  }
  if (fights.length === 0) return null;
  const last = fights[fights.length - 1]!;
  const total = Math.max(t, last.end) + k(FIGHTS_FADE_MS);
  const unsourced = (wave.gains ?? []).flatMap((g) =>
    !g.source || !fightOf.has(g.source) || !sources.has(g.source)
      ? [{ player: g.player, amount: g.amount, at: last.impact }]
      : [],
  );
  return {
    key: wave.key,
    firstStrike: wave.combat === "first-strike",
    fights,
    total,
    speed,
    fighters,
    unsourced,
  };
}

function rawLength(blocked: boolean, dies: boolean): number {
  return blocked
    ? FIGHT_FOCUS_MS +
        FIGHT_REAR_MS +
        FIGHT_LUNGE_MS +
        FIGHT_SECOND_MS +
        FIGHT_KNOCK_MS +
        FIGHT_BACK_MS +
        FIGHT_BEAT_MS +
        (dies ? FIGHT_CRACKED_MS : 0)
    : FIGHT_FOCUS_MS +
        STRIKE_REAR_MS +
        STRIKE_LUNGE_MS +
        STRIKE_HOLD_MS +
        STRIKE_BACK_MS +
        STRIKE_AFTER_MS;
}

const filterOf = (p: { red: number; bright: number }) =>
  `brightness(${p.bright * (1 + (RED.bright - 1) * p.red)}) sepia(${RED.sepia * p.red}) hue-rotate(${RED.hue * p.red}deg) saturate(${1 + (RED.saturate - 1) * p.red})`;

/**
 * The keyframes of one fighter over the whole sequence (plan.total), run
 * linear-timed on the card INSIDE its place on the table (its `.bf-card`),
 * so the place itself can hold still -- or Glide home afterwards -- on its
 * own: offsets are turned into the card's own frame (its tilt and size).
 * While another fight plays it is dimmed like the table; a card that dies
 * stays lit after its fight (it shatters). The first and last frames are
 * exactly its rest: it starts and ends where the layout puts it.
 */
export function fighterFrames(plan: FightPlan, item: string, box: Box, dies = false): Keyframe[] {
  const index = plan.fighters.get(item);
  const fight = index === undefined ? undefined : plan.fights[index];
  const poses = fight?.moves.get(item) ?? [];
  const theta = (-box.rotation * Math.PI) / 180;
  const scale = box.scale || 1;
  const local = (p: Pose) => ({
    x: (p.dx * Math.cos(theta) - p.dy * Math.sin(theta)) / scale,
    y: (p.dx * Math.sin(theta) + p.dy * Math.cos(theta)) / scale,
  });
  const dim = FIGHT_DIMMED;
  const all: Pose[] = [still(0, 1)];
  const fade = Math.min(FIGHTS_FADE_MS * plan.speed, plan.total);
  if (fight) {
    all.push(still(Math.min(fight.start, FIGHT_FOCUS_MS * plan.speed), fight.start > 0 ? dim : 1));
    for (const p of poses) all.push(p);
    // Dimmed right up to its own fight (this replaces its first pose, at
    // the same moment), then lit as the table dims to it.
    if (fight.start > 0) all.push(still(fight.start, dim));
    const after = dies ? 1 : dim;
    if (fight.end + FIGHT_FOCUS_MS * plan.speed < plan.total - fade) {
      all.push(still(fight.end + FIGHT_FOCUS_MS * plan.speed, after));
      all.push(still(plan.total - fade, after));
    }
  }
  all.push(still(plan.total, 1));
  const total = Math.max(1, plan.total);
  // In time order; a pose at the same moment as the one before replaces it.
  const sorted = all
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.at - b.p.at || a.i - b.i)
    .map(({ p }) => ({ ...p, at: Math.min(total, Math.max(0, p.at)) }));
  const frames: Keyframe[] = [];
  for (const p of sorted) {
    const at = local(p);
    const frame: Keyframe = {
      offset: p.at / total,
      transform: `translate(${at.x}px, ${at.y}px) rotate(${p.r}deg) scale(${p.s})`,
      filter: filterOf(p),
    };
    if (p.easing) frame["easing"] = p.easing;
    const prev = frames[frames.length - 1];
    if (prev && prev["offset"] === frame["offset"]) frames[frames.length - 1] = frame;
    else frames.push(frame);
  }
  frames[0] = { ...frames[0]!, offset: 0, transform: "translate(0px, 0px) rotate(0deg) scale(1)" };
  frames[frames.length - 1] = {
    ...frames[frames.length - 1]!,
    offset: 1,
    transform: "translate(0px, 0px) rotate(0deg) scale(1)",
    filter: filterOf({ red: 0, bright: 1 }),
  };
  return frames;
}
