// Phase 9 W-17 (Amendment 19, owner 2026-11-05) -- dice, rolls and the
// Un-set choices, in a real game on the real server.
//
// What the game sends was proven by the Mechanics Lab (check-dice: each
// roll question's dice, the card letting you change it and its price, the
// nudge's kind, the roll on BOTH boards; check-unset: the next crank). A
// game reaching Monitor Monitor, Beeble, sectors AND Contraptions is many
// turns of luck, so here the guest's own board and question are said
// again with those facts filled exactly as the worker fills them
// (routeWebSocket), and the page is checked: the die tumbles beside the
// card on the stack; the roll windows draw 3D dice, name the cards and
// say what passing means; "Raise or lower the roll" is no coin call;
// sectors and sprockets say what is in each and light those cards;
// cranking shows the Contraption. Screenshots in test-results/seen/w17-*.

import { expect, test, type WebSocketRoute } from "@playwright/test";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import { clearEverything, matchPanel, sharedDeck, startAMatch } from "./match-helpers";

type Frame = Record<string, unknown>;

test("dice tumble on the stack; the roll, sector, sprocket and crank windows say what they are", async ({
  browser,
}) => {
  test.setTimeout(400_000);
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host);
  await clearEverything(host);
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);

  let client: WebSocketRoute | null = null;
  let lastSnap = "";
  let lastAsk = "";
  await guest.routeWebSocket("**/ws/matches/**", (ws) => {
    client = ws;
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (typeof message === "string" && message.includes('"MATCH_SNAPSHOT"')) lastSnap = message;
      if (typeof message === "string" && message.includes('"DECISION_REQUEST"')) lastAsk = message;
      ws.send(message);
    });
    ws.onMessage((message) => server.send(message));
  });

  try {
    const deck = await sharedDeck(
      host,
      guest,
      join(process.cwd(), "..", "Test Deck", "ci-deck.zip"),
    );
    await startAMatch(host, guest, deck);
    // A real question of the guest's own to say again (the host passes
    // until priority comes round).
    await expect
      .poll(
        async () => {
          if (lastAsk.includes('"chooseSpellAbilityToPlay"')) return true;
          const act = matchPanel(host).locator("button.gs-act");
          if (await act.count())
            await act
              .first()
              .click({ timeout: 2_000 })
              .catch(() => {});
          return false;
        },
        { timeout: 200_000, intervals: [1_500] },
      )
      .toBe(true);
    await guest.waitForTimeout(1_000);

    const real = JSON.parse(lastSnap) as {
      state: {
        seat: number;
        stateRevision: number;
        hand: Frame[];
        battlefield: Frame[];
        stack: Frame[];
        rolls?: Frame[];
      };
    };
    const me = real.state.seat;
    const shape = real.state.hand[0]!;
    const onTable = (over: Frame): Frame => ({
      ...shape,
      zone: "battlefield",
      art: null,
      tapped: false,
      ...over,
    });
    const fly = onTable({ id: "card:903", name: "Ebony Fly", types: "Artifact", kind: "artifact" });
    const monitor = onTable({
      id: "card:904",
      name: "Monitor Monitor",
      types: "Creature — Elf",
      kind: "creature",
      power: 1,
      toughness: 1,
    });
    const lionsA = onTable({
      id: "card:901",
      name: "Savannah Lions",
      types: "Creature — Cat",
      kind: "creature",
      power: 2,
      toughness: 1,
      sector: "Alpha",
    });
    const lionsG = onTable({
      id: "card:905",
      name: "Savannah Lions",
      types: "Creature — Cat",
      kind: "creature",
      power: 2,
      toughness: 1,
      sector: "Gamma",
    });
    const giant = onTable({
      id: "card:906",
      name: "Hill Giant",
      types: "Creature — Giant",
      kind: "creature",
      power: 3,
      toughness: 3,
      sector: "Gamma",
      seat: 3 - me,
    });
    const sling = onTable({
      id: "card:902",
      name: "Goblin Slingshot",
      types: "Artifact — Contraption",
      kind: "artifact",
      sprocket: 3,
    });
    const rolling = {
      id: "stack:14",
      description: "Ebony Fly - Roll a d6.",
      source: "card:903",
      name: "Ebony Fly",
      owner: me,
      controller: me,
      kind: "ability",
      targets: [],
    };
    let revision = real.state.stateRevision + 100;
    const board = (stack: Frame[], rolls: Frame[]) => {
      const b = structuredClone(real);
      b.state.battlefield = [...b.state.battlefield, fly, monitor, lionsA, lionsG, giant, sling];
      b.state.stack = stack;
      b.state.rolls = rolls;
      b.state.stateRevision = ++revision;
      client?.send(JSON.stringify(b));
    };
    let id = 900_000;
    const ask = (q: Frame) => {
      const frame: Frame = { ...(JSON.parse(lastAsk) as Frame), ...q, decisionId: ++id };
      delete frame["about"];
      delete frame["notNow"];
      client?.send(JSON.stringify(frame));
    };
    const panel = matchPanel(guest);
    const window = (title: RegExp) => panel.getByRole("dialog", { name: title });

    // 1. Ebony Fly rolls: the die tumbles out beside the card on the stack.
    const roll = { n: 1, seat: me, source: "card:903", name: "Ebony Fly", sides: 6, results: [4] };
    board([rolling], [roll]);
    const die = panel.locator('.gs-roll[data-roll="1"]');
    await expect(die).toBeVisible();
    await expect(die.locator('[data-value="4"]')).toHaveCount(1);
    await expect(die.locator(".gs-die-cube .gs-die-face")).toHaveCount(6);
    const dieBox = (await die.boundingBox())!;
    // Beside the card on the stack: touching its left edge, not elsewhere.
    const card = (await panel
      .locator('[data-zone="stack"][data-object-id="stack:14"]')
      .boundingBox())!;
    expect(
      Math.abs(dieBox.x + dieBox.width / 2 - card.x),
      "beside the card on the stack",
    ).toBeLessThan(80);
    expect(dieBox.y).toBeGreaterThan(card.y);
    expect(dieBox.y).toBeLessThan(card.y + card.height);
    await guest.waitForTimeout(1_300);
    await guest.screenshot({ path: "test-results/seen/w17-roll.png" });

    // 2. The reroll question: a 3D die, the card and its price, Keep the 4.
    ask({
      kind: "chooseDiceToReroll",
      prompt: "You rolled 4. Choose dice to reroll, or pass.",
      mandatory: false,
      options: [{ actionId: "chooseDiceToReroll:0", label: "Roll: 4" }],
      arrange: {
        dice: {
          how: "reroll",
          sides: 6,
          rolls: [4],
          by: [{ id: "card:904", name: "Monitor Monitor" }],
          price: "{1}",
        },
      },
    });
    const reroll = window(/^Reroll the 4 for/);
    await expect(reroll).toBeVisible();
    await expect(reroll).toContainText("Ebony Fly rolled 4");
    await expect(reroll).toContainText("Monitor Monitor lets you reroll for");
    await expect(reroll.locator(".gs-dice .gs-die-cube")).toHaveCount(1);
    await expect(reroll.getByRole("button", { name: "Keep the 4" })).toBeVisible();
    await expect(reroll.getByRole("button", { name: /^Reroll/ })).toBeVisible();
    await expect(reroll.getByRole("button", { name: /^Peek/ })).toBeVisible();
    await expect(reroll).not.toContainText("These are the actions you can take");
    await guest.waitForTimeout(1_300);
    await guest.screenshot({ path: "test-results/seen/w17-reroll.png" });

    // 3. Raise or lower: not a coin.
    ask({
      kind: "chooseBinary",
      prompt: "Increase or decrease result 6 by 1",
      mandatory: true,
      options: [
        { actionId: "binary:yes", label: "Increase" },
        { actionId: "binary:no", label: "Decrease" },
      ],
      arrange: { binary: "IncreaseOrDecrease" },
    });
    const raise = window(/^Raise or lower the roll$/);
    await expect(raise).toBeVisible();
    await expect(raise).not.toContainText("flips");
    await expect(panel.getByText("Call it", { exact: true })).toHaveCount(0);

    // 4. Ignore one of two: two dice, no pass.
    ask({
      kind: "chooseRollToIgnore",
      prompt: "Rolled 4, 5. Choose a roll to ignore.",
      mandatory: true,
      options: [
        { actionId: "chooseRollToIgnore:0", label: "Roll: 4" },
        { actionId: "chooseRollToIgnore:1", label: "Roll: 5" },
      ],
      arrange: { dice: { how: "ignore", sides: 6, rolls: [4, 5], by: [] } },
    });
    const ignore = window(/^Ignore which roll\?$/);
    await expect(ignore.locator(".gs-dice-pick")).toHaveCount(2);
    await guest.waitForTimeout(1_300);
    await guest.screenshot({ path: "test-results/seen/w17-ignore.png" });

    // 5. A sector: who is in each, lit when pointed at.
    board([], [roll]);
    ask({
      kind: "chooseSector",
      prompt: "Choose a sector.",
      mandatory: true,
      options: ["Alpha", "Beta", "Gamma"].map((l, i) => ({
        actionId: `chooseSector:${i}`,
        label: l,
      })),
      arrange: null,
    });
    const sector = window(/^Choose a sector$/);
    await expect(sector.locator(".gs-place")).toHaveText([
      /Alphayour Savannah Lions/,
      /Betaempty/,
      /Gammayour Savannah Lions, their Hill Giant/,
    ]);
    await sector.locator(".gs-place").nth(2).hover();
    await expect(panel.locator('[data-lit="true"]')).toHaveCount(2);
    await guest.screenshot({ path: "test-results/seen/w17-sector.png" });
    await guest.mouse.move(10, 10);
    await expect(panel.locator('[data-lit="true"]')).toHaveCount(0);

    // 6. A sprocket: when it cranks, what is on it.
    ask({
      kind: "chooseSprocket",
      prompt: "Assemble Goblin Slingshot onto a sprocket.",
      mandatory: true,
      options: [
        { actionId: "chooseSprocket:0", label: "Sprocket 1, cranks next turn" },
        { actionId: "chooseSprocket:1", label: "Sprocket 2" },
        { actionId: "chooseSprocket:2", label: "Sprocket 3 (1 there)" },
      ],
      arrange: { crankNext: 1 },
    });
    const sprocket = window(/^Put Goblin Slingshot on a sprocket$/);
    await expect(sprocket.locator(".gs-place")).toHaveText([
      /cranks next turn · empty/,
      /cranks in 2 turns · empty/,
      /cranks in 3 turns · Goblin Slingshot/,
    ]);
    await expect(sprocket).not.toContainText("--");
    await guest.screenshot({ path: "test-results/seen/w17-sprocket.png" });

    // 7. Crank: the Contraption's picture, Crank / Don't crank.
    ask({
      kind: "chooseContraptionsToCrank",
      prompt: "Crank which Contraptions on sprocket 3? (up to 1, or pass)",
      mandatory: false,
      options: [{ actionId: "card:902", label: "Goblin Slingshot", objectId: "card:902" }],
      arrange: null,
    });
    const crank = window(/^Crank Goblin Slingshot\?$/);
    await expect(crank.locator(".gs-win-bigcard")).toHaveCount(1);
    await expect(crank.getByRole("button", { name: "Don't crank" })).toBeVisible();
    await expect(crank.getByRole("button", { name: "Crank", exact: true })).toBeVisible();
    await guest.screenshot({ path: "test-results/seen/w17-crank.png" });
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
