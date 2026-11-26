// The replayed table of the measuring kit (PHASE_11 P11-C1, C2, C5): a real
// game page whose match socket is taken over once the game runs, so no
// polling and no clicks fall in a measured stretch and the same boards come
// in the same rhythm every run (the jumps tool's method). Shared by the
// redraw measure (redraw.spec.ts) and the repaint measure (repaint.spec.ts).

import { expect, type Browser, type Page, type WebSocketRoute } from "@playwright/test";
import { secondPassword, secondUser, signIn, signInAs } from "../../e2e/helpers";
import { clearEverything, sharedDeck, startAMatch } from "../../e2e/match-helpers";
import { RECORDER } from "../../e2e/speed-kit";
import { DeltaStream, WholeBoards } from "../../src/delta";
import { tap } from "./wire";

/** Two players signed in, the deck shared, nothing left over. */
export async function twoPlayers(browser: Browser, pkg: string, init = true, tapped = false) {
  // P11-D2: the real game's pages go through a counting relay each, so the
  // wire rows can say what crossed the wire as well as what the page read.
  const target = new URL(process.env.PROXIC_E2E_URL ?? "http://127.0.0.1:8080");
  const taps = tapped ? [await tap(target), await tap(target)] : [];
  const options = (i: number) => ({
    viewport: { width: 1920, height: 1080 },
    ...(taps[i] ? { baseURL: taps[i].base } : {}),
  });
  const contexts = [await browser.newContext(options(0)), await browser.newContext(options(1))];
  if (init) await contexts[0]!.addInitScript(RECORDER);
  const [host, guest] = [await contexts[0]!.newPage(), await contexts[1]!.newPage()];
  await signIn(host);
  await clearEverything(host);
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const deck = await sharedDeck(host, guest, pkg);
  const done = async () => {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    for (const c of contexts) await c.close();
    for (const t of taps) await t.close();
  };
  return { host, guest, deck, done, taps };
}

/** Wait until nothing that ends is still moving on [page] (looping glows don't count). */
export async function still(page: Page) {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
      undefined,
      { timeout: 15_000, polling: 100 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(500);
}

export type Card = Record<string, unknown> & { id: string };
export type State = Record<string, unknown> & {
  seat: number;
  battlefield: Card[];
  hand: Card[];
  players: (Record<string, unknown> & { seat: number; life: number })[];
  stateRevision: number;
};

/**
 * [side] permanents a side (40: 16 Forests, 24 Grizzly Bears; two fifths
 * Forests at any size), made from the deck's own cards. P11-B2: with
 * [flyers], that many of each side's creatures fly.
 */
export function bigTable(base: State, side = 40, flyers = 0): State {
  const forest = base.hand.find((c) => c["name"] === "Forest") ?? base.hand[0]!;
  const bear = base.hand.find((c) => c["kind"] === "creature") ?? {
    ...forest,
    name: "Grizzly Bears",
    kind: "creature",
    types: "Creature - Bear",
  };
  const seats = base.players.map((p) => p.seat);
  const battlefield: Card[] = [];
  let id = 9000;
  for (const seat of seats) {
    let flying = 0;
    for (let i = 0; i < side; i++) {
      const land = i < Math.round(side * 0.4);
      const from = land ? forest : bear;
      const fly = !land && flying++ < flyers;
      battlefield.push({
        ...from,
        id: `card:${++id}`,
        seat,
        owner: seat,
        enteredAt: 1,
        tapped: false,
        faceDown: false,
        known: true,
        ...(land
          ? { kind: "land", types: "Basic Land - Forest", makes: ["G"] }
          : {
              kind: "creature",
              power: 2,
              toughness: 2,
              basePower: 2,
              baseToughness: 2,
              damage: 0,
              sick: false,
              attacking: false,
              blocking: false,
              ...(fly ? { keywords: ["Flying"] } : {}),
            }),
      });
    }
  }
  return { ...base, battlefield, stack: [], casting: [], payments: [] };
}

/** The busy table's k-th change, made on [s] (k from 0). */
export function busyChange(s: State, k: number): State {
  const me = s.seat;
  const mine = (kind: string) =>
    s.battlefield.filter((c) => c["seat"] === me && c["kind"] === kind);
  const theirs = (kind: string) =>
    s.battlefield.filter((c) => c["seat"] !== me && c["kind"] === kind);
  const set = (id: string, patch: Record<string, unknown>) => ({
    ...s,
    battlefield: s.battlefield.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  });
  switch (k % 5) {
    case 0: {
      const land = mine("land")[k % 16]!;
      return set(land.id, { tapped: !land["tapped"] });
    }
    case 1: {
      const bear = theirs("creature")[0]!;
      return {
        ...s,
        battlefield: [...s.battlefield, { ...bear, id: `card:${9500 + k}`, enteredAt: 100 + k }],
      };
    }
    case 2: {
      const bear = mine("creature")[k % 24]!;
      return set(bear.id, { attacking: true, tapped: true });
    }
    case 3: {
      const attacking = s.battlefield.find((c) => c["attacking"] === true);
      const after = attacking ? set(attacking.id, { attacking: false }) : s;
      return {
        ...after,
        players: after.players.map((p) => (p.seat === me ? p : { ...p, life: p.life - 2 })),
      };
    }
    default: {
      const gone = theirs("creature").at(-1)!;
      return { ...s, battlefield: s.battlefield.filter((c) => c.id !== gone.id) };
    }
  }
}

export interface Bench {
  /** The board the game sent last before the take-over (its seat, its players, its hand). */
  base: State;
  /** The board the page holds now (the last one sent). */
  now: () => State;
  /** Send [s] as the next board (a new revision; whole, or a delta as the server would). */
  send: (s: State) => void;
}

/**
 * Start a game on [host] and [guest] and take over the host page's match
 * socket once it runs: from then on only `send`'s boards reach the page,
 * and no question (DECISION_*, MATCH_ASKING) does. P11-C2: the boards go as
 * the server sends them (P11-D4): a whole board first, then only what
 * changed (`DeltaStream`), so the page builds each on the one it holds;
 * [whole] sends every board whole.
 */
export async function takeOver(
  host: Page,
  guest: Page,
  deck: string,
  whole = false,
): Promise<Bench> {
  let client: WebSocketRoute | null = null;
  let takenOver = false;
  let base: { message: Record<string, unknown>; state: State } | null = null;
  const wholeBoards = new WholeBoards();
  await host.routeWebSocket("**/ws/matches/**", (ws) => {
    client = ws;
    const server = ws.connectToServer();
    server.onMessage((m) => {
      if (typeof m === "string" && /"MATCH_(SNAPSHOT|DELTA)"/.test(m)) {
        if (takenOver) return;
        // P11-D3: the whole board (its history rebuilt), so the replayed table is whole.
        // P11-D4: a delta rebuilt too, and the page handed the whole board, so
        // the bench's boards (built from this one) meet no later delta.
        const text = wholeBoards.take(m);
        const message = JSON.parse(text) as Record<string, unknown> & { state: State };
        base = { message, state: message.state };
        ws.send(text);
        return;
      }
      if (
        takenOver &&
        typeof m === "string" &&
        (m.includes('"DECISION_') || m.includes('"MATCH_ASKING"'))
      )
        return;
      ws.send(m);
    });
    ws.onMessage((m) => server.send(m));
  });
  await startAMatch(host, guest, deck);
  await expect.poll(() => base !== null && client !== null, { timeout: 120_000 }).toBe(true);
  await host.waitForTimeout(2_000);
  takenOver = true;
  const b = base!;
  let rev = b.state.stateRevision + 1_000;
  let now = b.state;
  const stream = new DeltaStream();
  return {
    base: b.state,
    now: () => now,
    send: (s: State) => {
      now = { ...s, stateRevision: ++rev };
      const out = whole ? { type: "MATCH_SNAPSHOT", body: now } : stream.step(now);
      client!.send(
        JSON.stringify(
          out.type === "MATCH_SNAPSHOT"
            ? { ...b.message, state: out.body }
            : {
                protocolVersion: b.message["protocolVersion"],
                messageId: b.message["messageId"],
                type: out.type,
                ...out.body,
              },
        ),
      );
    },
  };
}

// --- P11-C5: the repaint measure's moments, as boards ---------------------------------------

/** A creature card for the hand, from the table's own bears. */
export function handBears(s: State, n: number): Card[] {
  const bear = s.battlefield.find((c) => c["kind"] === "creature")!;
  return Array.from({ length: n }, (_, i) => ({
    ...bear,
    id: `card:${8001 + i}`,
    seat: s.seat,
    owner: s.seat,
    manaCost: "{1}{G}",
  }));
}

/** A land tapping or untapping, the same Forest each time. */
export const tapLand = (now: State) => {
  const land = now.battlefield.find((c) => c["seat"] === now.seat && c["kind"] === "land")!;
  return {
    ...now,
    battlefield: now.battlefield.map((c) =>
      c.id === land.id ? { ...c, tapped: !c["tapped"] } : c,
    ),
  };
};

/** A cast and its resolution, by turns: a hand bear onto the stack (two Forests pay), then onto the table. */
export function casts() {
  let casting: Card | null = null;
  return (now: State): State | null => {
    if (casting) {
      const card = casting;
      casting = null;
      return {
        ...now,
        stack: [],
        battlefield: [
          ...now.battlefield,
          { ...card, kind: "creature", enteredAt: 500, sick: true, tapped: false },
        ],
      };
    }
    const card = now.hand[0];
    if (!card) return null;
    casting = card;
    const name = typeof card["name"] === "string" ? card["name"] : "Grizzly Bears";
    const lands = now.battlefield
      .filter((c) => c["seat"] === now.seat && c["kind"] === "land" && !c["tapped"])
      .slice(0, 2)
      .map((c) => c.id);
    return {
      ...now,
      hand: now.hand.slice(1),
      battlefield: now.battlefield.map((c) => (lands.includes(c.id) ? { ...c, tapped: true } : c)),
      stack: [
        {
          id: `stack:${card.id.slice(5)}`,
          description: name,
          source: card.id,
          name: name,
          controller: now.seat,
          kind: "spell",
          targets: [],
          art: card["art"] ?? null,
          manaCost: "{1}{G}",
        },
      ],
    };
  };
}

/** A combat in four boards: two attack, one is blocked, damage (both fighters die), the end. */
export function combatStep(k: number) {
  return (now: State): State => {
    const me = now.seat;
    const them = now.players.find((p) => p.seat !== me)!.seat;
    const ready = (seat: number) =>
      now.battlefield.filter(
        (c) => c["seat"] === seat && c["kind"] === "creature" && !c["tapped"] && !c["sick"],
      );
    const combat = now["combat"] as
      | { attackers: { id: string }[]; blocks: { blocker: string; attacker: string }[] }
      | null
      | undefined;
    const set = (ids: string[], patch: Record<string, unknown>) =>
      now.battlefield.map((c) => (ids.includes(c.id) ? { ...c, ...patch } : c));
    switch (k % 4) {
      case 0: {
        const two = ready(me)
          .slice(0, 2)
          .map((c) => c.id);
        return {
          ...now,
          battlefield: set(two, { attacking: true, tapped: true }),
          combat: { attackers: two.map((id) => ({ id, target: { player: them } })), blocks: [] },
        };
      }
      case 1: {
        const blocker = ready(them)[0]!.id;
        const attacker = combat!.attackers[0]!.id;
        return {
          ...now,
          battlefield: set([blocker], { blocking: true }),
          combat: { ...combat!, blocks: [{ blocker, attacker }] },
        };
      }
      case 2: {
        const { blocker, attacker } = combat!.blocks[0]!;
        const free = combat!.attackers[1]!.id;
        return {
          ...now,
          battlefield: now.battlefield.filter((c) => c.id !== blocker && c.id !== attacker),
          players: now.players.map((p) => (p.seat === them ? { ...p, life: p.life - 2 } : p)),
          damage: {
            key: `bench-damage-${now.stateRevision}`,
            hits: [
              { source: attacker, target: { object: blocker }, amount: 2 },
              { source: blocker, target: { object: attacker }, amount: 2 },
              { source: free, target: { player: them }, amount: 2 },
            ],
          },
        };
      }
      default:
        return {
          ...now,
          battlefield: now.battlefield.map((c) =>
            c["attacking"] ? { ...c, attacking: false } : c,
          ),
          combat: null,
          damage: null,
        };
    }
  };
}
