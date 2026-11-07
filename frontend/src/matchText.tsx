// What the game screen says about a match, kept from Phase 6's text panel
// (PHASE_06 §6.17) when the battlefield replaced it (§7.60): the question
// headings and hints, the card-name search, the result line, and where
// the game connection lives. The panel itself was removed 2026-10-22.

import { useEffect, useState } from "react";
import type { Decision, DecisionAbout } from "./match";
import type { MatchView } from "./lobby";

/**
 * P6-AG — naming a card: search, then pick.
 *
 * Forge allows tens of thousands of names, so they are never sent.
 * The player types; the server returns what matched, from FORGE's
 * list, best match first; the player picks one of those. The page
 * never invents a name and never accepts typed text as the answer:
 * the answer is always one of the results it was sent.
 *
 * Results are shown only for the text currently in the box. A
 * reply for an older keystroke arriving late would otherwise
 * replace the list under the player's cursor.
 */
export function NameSearch({
  decision,
  disabled,
  onSearch,
  onChoose,
}: {
  decision: Decision;
  disabled: boolean;
  onSearch: (query: string) => void;
  onChoose: (actionId: string) => void;
}) {
  const [query, setQuery] = useState("");
  // The server trims and caps what it searches for; compare like with like.
  const asked = query.trim().slice(0, 64);

  useEffect(() => {
    if (!asked) return;
    // Wait for a pause in typing rather than searching every key.
    const timer = window.setTimeout(() => onSearch(asked), 200);
    return () => window.clearTimeout(timer);
  }, [asked, onSearch]);

  const results = decision.results?.query === asked ? decision.results : null;

  return (
    <div className="name-search">
      <label>
        Card name
        <input
          type="search"
          value={query}
          autoFocus
          autoComplete="off"
          placeholder="Start typing a card's name"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {asked && !results && <p className="hint">Searching…</p>}
      {results && results.total === 0 && <p className="hint">No card is called that.</p>}
      {results && results.options.length > 0 && (
        <ul className="actions-list" aria-label="Matching names">
          {results.options.map((option) => (
            <li key={option.actionId}>
              <button type="button" disabled={disabled} onClick={() => onChoose(option.actionId)}>
                {option.label ?? option.actionId}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        {results && results.total > results.options.length
          ? `Showing ${results.options.length} of ${results.total.toLocaleString()} matches. Type more to narrow it down.`
          : `Any of ${decision.optionCount.toLocaleString()} card names can go here. Type to search them.`}
      </p>
    </div>
  );
}

/**
 * Spec 0056 — a game the server stopped under (an update, a restart): told
 * plainly, never as a result and never as a plain "game over". The
 * owner-approved words, for the banner (title and line) and in full.
 */
export const SERVER_UPDATE_TITLE = "The server is being updated";
export const SERVER_UPDATE_LINE =
  "This game couldn't be finished before the update. It isn't counted as a win or a loss. Your room is still here.";
export const SERVER_UPDATE_WORDS = `${SERVER_UPDATE_TITLE}. ${SERVER_UPDATE_LINE}`;

/**
 * Spec 0056 — this game ended because the server stopped: the server said
 * so on the game's socket ([stopping]), or the match ended SERVER_RESTARTED
 * (at the stop, or found by the next start's recovery).
 */
export function serverWasUpdated(match: MatchView, stopping = false): boolean {
  return (
    stopping || (match.status === "FAILED_RUNTIME" && match.failureCode === "SERVER_RESTARTED")
  );
}

/**
 * §6.149 — FORGE decided this, and the page only reads it.
 *
 * Nothing here looks at life totals, connections or who left.
 * The winner is a SEAT the server sent; turning it into "you" or
 * a name is the only interpretation allowed, and it uses the
 * participant list the page already holds.
 */
export function resultText(match: MatchView, mySeat: number | null): string {
  if (serverWasUpdated(match)) return SERVER_UPDATE_WORDS;
  if (match.status === "FAILED_RUNTIME" || match.outcome?.kind === "FAILED") {
    // §6.154 — not a loss for anybody. A match that stopped is a
    // fault, and recording a winner for it would be a lie.
    return "The game stopped before it finished. Nobody won it.";
  }
  const outcome = match.outcome;
  if (!outcome) return "The game is over.";

  const turn = outcome.endedOnTurn > 0 ? ` on turn ${outcome.endedOnTurn}` : "";
  if (outcome.kind === "DRAW") return `The game was a draw${turn}.`;
  if (outcome.kind !== "WINNER" || outcome.winningSeat === null) {
    return `The game ended without a result${turn}.`;
  }
  // P6-AP — Forge's own sentence for why, when it gave one. Every
  // PlayerOutcome reads "has won ...", so "The winner" is its
  // subject; nothing about it is reworded.
  // §7.55 — a concession, said as one: Forge's result, and who gave up.
  if (outcome.concededSeat !== null) {
    if (outcome.concededSeat === mySeat) return `You conceded${turn}. Your opponent won.`;
    if (outcome.winningSeat === mySeat) return `Your opponent conceded${turn}. You won.`;
  }
  const why = outcome.reason ? ` The winner ${outcome.reason}.` : "";
  if (outcome.winningSeat === mySeat) return `You won${turn}.${why}`;

  // The match participant list carries seats, not names (§5.47
  // keeps other people's decks out of it, and names were never
  // needed before). With two seats "your opponent" is exact; with
  // more it would not be, so the seat is named instead. FMT-005
  // keeps that case representable even though Open Format is two.
  return match.participants.length === 2
    ? `Your opponent won${turn}.${why}`
    : `Seat ${outcome.winningSeat} won${turn}.${why}`;
}

/**
 * What Forge is asking, in the player's words.
 *
 * Found by LOOKING at it (AGENTS TEST-011): a target choice was
 * headed "Your move" and footed "These are the actions Forge
 * says you can take", so a list of two player names read as a
 * list of things to do. The decision's kind was already in the
 * protocol and simply was not used.
 *
 * An unknown kind falls back to the general wording rather than
 * showing the raw name: a newer server asking something this
 * build has never heard of should still be answerable.
 */
export function headingFor(kind: string): string {
  switch (kind) {
    case "chooseTargetsFor":
      return "Choose a target";
    case "chooseTarget":
      return "Change which target?";
    case "getAbilityToPlay":
      return "Choose which ability";
    case "chooseManaAbility":
      return "Choose which mana to make";
    case "applyManaToCost":
      // Phase 9 Amendment 13 (item 9, owner-approved words).
      return "Pay the mana";
    case "chooseCardsToDiscardToMaximumHandSize":
      return "Discard a card";
    case "declareAttackers":
      return "Declare attackers";
    case "declareBlockers":
      return "Declare blockers";
    case "chooseDefender":
      return "Choose what to attack";
    case "chooseBlockTarget":
      return "Choose what to block";
    case "assignCombatDamage":
      return "Assign combat damage";
    case "exertAttackers":
      return "Exert attackers";
    case "enlistAttackers":
      return "Enlist attackers";
    case "chooseCardsToRevealFromHand":
      return "Reveal from your hand";
    case "chooseCardsPile":
      return "Choose a pile";
    case "chooseKeywordForPump":
      return "Choose what it gains";
    case "chooseCardsForSplice":
      return "Splice";
    case "chooseSingleCardState":
      return "Choose a door";
    case "chooseCardsToDiscardUnlessType":
      return "Discard";
    case "orderSimultaneousAbilities":
      return "Choose what resolves first";
    case "chooseSingleReplacementEffect":
      return "Choose which effect applies";
    case "chooseCounterType":
      return "Choose a kind of counter";
    case "chooseModeForAbility":
      return "Choose a mode";
    case "announceRequirements":
      return "Choose how much";
    case "chooseSingleEntityForEffect":
      return "Choose one";
    case "chooseEntitiesForEffect":
      return "Choose from these";
    case "choosePermanentsToSacrifice":
      return "Sacrifice";
    case "choosePermanentsToDestroy":
      return "Destroy";
    case "orderMoveToZoneList":
      return "Put them in order";
    case "mulliganKeepHand":
      return "Keep or mulligan";
    case "tuckCardsViaMulligan":
      return "Put a card back";
    case "chooseStartingPlayer":
      return "Play or draw";
    case "chooseSaToActivateFromOpeningHand":
      return "Begin with it on the battlefield";
    case "chooseSomeType":
      return "Choose a type";
    case "chooseColor":
    case "chooseColors":
      return "Choose a colour";
    case "specifyManaCombo":
      return "Choose the mana's colours";
    case "chooseProtectionType":
      return "Choose protection";
    case "chooseCardName":
      return "Name a card";
    case "chooseBinary":
      return "Call it";
    // Phase 9 Amendment 20: tapping to help pay, never "Your move".
    case "chooseCardsForConvokeOrImprovise":
      return "Tap to help pay";
    case "chooseNumber":
      return "Choose a number";
    case "divideAsYouChoose":
      return "Split it";
    case "chooseSingleCardFace":
    case "chooseSingleSpellForEffect":
      return "Choose one";
    case "chooseSpellAbilitiesForEffect":
      return "Choose what it does";
    case "arrangeForScry":
      return "Scry";
    case "arrangeForSurveil":
      return "Surveil";
    case "willPutCardOnTop":
      return "Top or bottom";
    case "CostPutCounter":
      return "Choose where the counter goes";
    case "CostRemoveCounter":
      return "Choose where to take a counter from";
    case "CostTapType":
      return "Choose what to tap";
    case "chooseCardsForCost":
      return "Choose what to pay with";
    case "chooseNumberForKeywordCost":
      return "Pay it extra times?";
    case "CostSacrifice":
      return "Choose what to sacrifice";
    case "CostDiscard":
      return "Choose what to discard";
    case "CostExile":
      return "Choose what to exile";
    case "CostReturn":
      return "Choose what to return to hand";
    case "CostReveal":
      return "Choose what to reveal";
    case "CostExert":
      return "Choose what to exert";
    case "CostBehold":
      return "Choose what to behold";
    case "CostCollectEvidence":
      return "Collect evidence";
    case "CostBlight":
      return "Blight";
    case "CostEnlist":
      return "Choose what to enlist";
    case "CostForage":
      return "Forage";
    case "CostGainLife":
      return "Choose an opponent";
    case "CostPutCardToLib":
      return "Choose what to put on top";
    case "CostUntapType":
      return "Choose what to untap";
    case "CostRemoveAnyCounter":
      return "Choose where to remove a counter";
    case "CostExiledMoveToGrave":
      return "Choose from exile";
    case "CostUnattach":
      return "Choose what to unattach";
    case "CostExileFromStack":
      return "Choose a spell to exile";
    case "confirmBidAction":
      return "Bid life";
    case "chooseFlipResult":
      return "Choose a flip";
    case "chooseDiceToReroll":
      return "Reroll dice";
    case "chooseRollToModify":
      return "Change a roll";
    case "chooseRollToIgnore":
      return "Ignore a roll";
    case "chooseRollToSwap":
      return "Exchange a roll";
    case "chooseRollSwapValue":
      return "Power or toughness";
    case "chooseSector":
      return "Choose a sector";
    case "chooseSprocket":
      return "Choose a sprocket";
    case "chooseContraptionsToCrank":
      return "Crank Contraptions";
    case "divideShield":
      return "Divide the shield";
    case "confirmTrigger":
    case "confirmAction":
    case "confirmPayment":
    case "confirmReplacementEffect":
    case "confirmStaticApplication":
      return "Confirm";
    case "chooseOptionalCosts":
      // Spec 0042: it read "Your move", and a player took Archon's
      // Glory's Bargain for a trigger. optionalCostTitle names the cost.
      return "Pay an optional cost?";
    default:
      return "Your move";
  }
}

export function hintFor(kind: string, options: number): string {
  if (options === 0) {
    return "Nothing can be done right now; passing is the only answer.";
  }
  switch (kind) {
    case "chooseTargetsFor":
      // §6.93 — the candidates are Forge's, and saying so is not
      // decoration: it is why an option that looks wrong is not
      // a bug in the page.
      return "These are the legal targets. Cancel (or Esc) backs out.";
    case "getAbilityToPlay":
      return "That card can do more than one thing. Cancel (or Esc) backs out.";
    case "applyManaToCost":
    case "chooseManaAbility":
      // The card shows what is still due, so the hint says what the choice
      // IS (Phase 9 Amendment 13, item 9).
      return "Tap a land or other source, or use mana you already made. Cancel (or Esc) takes back the whole spell.";
    case "chooseCardsToDiscardToMaximumHandSize":
      return "You are over your maximum hand size. This cannot be skipped.";
    case "declareAttackers":
      return "Choose attackers one at a time. Pass when you are done attacking.";
    case "declareBlockers":
      return "Choose blockers one at a time. Pass to take the damage.";
    case "assignCombatDamage":
      return "One point at a time, so nothing is assigned for you.";
    case "exertAttackers":
      return "Click each attacker to exert, one at a time. Pass when you are done.";
    case "enlistAttackers":
      return "Click each attacker to enlist, one at a time. Pass when you are done.";
    case "chooseCounterType":
      // The prompt above already names the card, because Forge
      // wrote it. What this adds is that the kind MATTERS: these
      // are not interchangeable, and nothing will pick for you.
      return "Which counter this is changes what it does. This cannot be skipped.";
    case "chooseModeForAbility":
      // A modal card does ONE of these. Passing, where it is
      // allowed at all, means "no more modes" rather than
      // cancelling the spell -- which is worth saying, because
      // every other Pass in this panel cancels something.
      return "The card does the mode you pick. Pass, if offered, takes no further mode.";
    case "chooseSingleEntityForEffect":
      // The generic chooser: sacrificing something, exiling
      // something, searching a library. Forge's own line above
      // says which, so this says where the list came from -- a
      // library search shows cards nobody else can see, and that
      // being deliberate rather than a leak is worth knowing.
      return "Only these may be chosen here. The line above says what for.";
    case "mulliganKeepHand":
      // Says what mulliganing COSTS, because the prompt gives the
      // hand size and not the consequence.
      return "A mulligan draws seven again and puts one more back each time.";
    case "tuckCardsViaMulligan":
      return "These go to the bottom of your library. This cannot be skipped.";
    case "chooseStartingPlayer":
      return "On the play you are a turn ahead; on the draw you are a card ahead.";
    case "chooseSaToActivateFromOpeningHand":
      // §6.68 — it is NOT cast: no mana, no stack, nothing to respond
      // to. Saying so stops the page reading like a free spell.
      return "These start the game on the battlefield. They aren't cast and cost nothing. Choose them one at a time in the order they happen, then pass when you have the ones you want.";
    case "chooseSomeType":
    case "chooseColor":
    case "chooseColors":
    case "chooseProtectionType":
    case "chooseCardName":
      // Says where the list came from, because this is the one
      // family of choices that is NOT about anything on the
      // board: the list is Forge's, not the page's (P6-AH).
      return "These are the values allowed. Nothing here is a card on the board.";
    case "chooseBinary":
      // The call is yours; the flip is not. Worth saying, because
      // a player who calls heads and loses should know the game
      // flipped it, not the page.
      return "You call it. The game flips it, and the result is announced.";
    case "orderMoveToZoneList":
      // The prompt names the END being chosen for — "closest to
      // the top", "closest to the bottom" — because that is the
      // entire decision, and a list of cards with no end named
      // reads as a choice of ONE rather than a sort.
      return "Each pick is the next one in order. This cannot be skipped.";
    case "chooseEntitiesForEffect":
      // Several, one click at a time. The prompt carries the
      // count -- how many more are needed, or how many more are
      // allowed -- so this says what the clicking IS.
      return "Pick them one at a time. The line above says how many more.";
    case "choosePermanentsToSacrifice":
    case "choosePermanentsToDestroy":
      // Spec 0001: an edict asks YOU about your own, even on the
      // other player's spell -- so this says whose choice it is.
      // Asked even with one to choose (0001 D2): you see what you
      // lose before it goes.
      return "It is your choice: click one of yours on the board.";
    case "announceRequirements":
      // Says what the number COSTS, because that is the part a
      // list of numbers does not show. Not "the list stops at
      // what you can pay" -- it does not, deliberately, and a
      // hint that describes the page wrongly is worse than none.
      return "You pay for what you choose. The list grows as the board can pay for more.";
    case "CostPutCounter":
    case "CostRemoveCounter":
    case "CostTapType":
    case "CostSacrifice":
    case "CostDiscard":
    case "CostExile":
    case "CostReturn":
    case "CostReveal":
    case "CostExert":
    case "CostBehold":
    case "CostCollectEvidence":
    case "CostBlight":
    case "CostEnlist":
    case "CostForage":
    case "CostGainLife":
    case "CostPutCardToLib":
    case "CostUntapType":
    case "CostRemoveAnyCounter":
    case "CostExiledMoveToGrave":
    case "CostUnattach":
    case "CostExileFromStack":
      return "This is part of paying for what you are doing. Cancel (or Esc) backs out.";
    case "arrangeForScry":
    case "arrangeForSurveil":
    case "willPutCardOnTop":
      // Library cards: worth saying they are shown to this player
      // alone, as Forge shows them (spec 0001: as pictures).
      return "Only you can see these cards. The line above says what to do with them.";
    case "divideAsYouChoose":
      return "Each target gets at least 1. What is left goes to the targets after this one.";
    case "chooseNumber":
      return "These are the numbers allowed. This cannot be skipped.";
    case "chooseNumberForKeywordCost":
      return "Each time costs that much more, and does that much more. None is an answer.";
    case "chooseCardsForCost":
      // An "unless you pay" while something resolves: passing is a real
      // answer -- the line above says what happens then.
      return "Pick the cards to pay with. The line above says what happens if you do not pay.";
    case "chooseOptionalCosts":
      return "Pay it as you cast the spell, or choose No to cast it without.";
    // Phase 9 Amendment 20: the kinds whose window already says it all --
    // no filler line under them.
    case "chooseBlockTarget":
    case "chooseDefender":
    case "chooseCardsPile":
    case "chooseCardsForConvokeOrImprovise":
    case "chooseCardsForSplice":
    case "chooseCardsToDiscardUnlessType":
    case "chooseCardsToRevealFromHand":
    case "chooseContraptionsToCrank":
    case "chooseDiceToReroll":
    case "chooseFlipResult":
    case "chooseKeywordForPump":
    case "chooseRollSwapValue":
    case "chooseRollToIgnore":
    case "chooseRollToModify":
    case "chooseRollToSwap":
    case "chooseSector":
    case "chooseSingleCardFace":
    case "chooseSingleCardState":
    case "chooseSingleReplacementEffect":
    case "chooseSingleSpellForEffect":
    case "chooseSpellAbilitiesForEffect":
    case "chooseSpellAbilityToPlay":
    case "chooseSprocket":
    case "chooseTarget":
    case "confirmAction":
    case "confirmBidAction":
    case "confirmPayment":
    case "confirmReplacementEffect":
    case "confirmStaticApplication":
    case "confirmTrigger":
    case "divideShield":
    case "orderSimultaneousAbilities":
    case "specifyManaCombo":
      return "";
    // A kind this page has never seen (§7.33): still a plain word.
    default:
      return "Choose one of these.";
  }
}

/**
 * Spec 0042 -- an optional cost asked as itself: Archon's Glory's one
 * option "Bargain – Sacrifice an artifact, enchantment or token" is
 * "Bargain?"; several are "Pay optional costs?".
 */
export function optionalCostTitle(decision: Decision): string {
  const names = decision.options.map((o) => (o.label ?? "").split(/\s[–—·-]\s/)[0]!.trim());
  return names.length === 1 && names[0] ? `${names[0]}?` : "Pay optional costs?";
}

export function matchUrl(matchId: string): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/matches/${matchId}`;
}

/**
 * What Cancel says (owner 2026-10-22: "cancel all, by name"): backing out
 * undoes the whole thing -- Forge returns the card where it came from and
 * refunds any mana paid -- so nothing is spent.
 */
export function cancelWords(about: DecisionAbout | null): { word: string; sub: string } {
  if (!about) return { word: "Cancel", sub: "Back out. Nothing is spent." };
  switch (about.kind) {
    case "spell":
      return {
        word: `Cancel ${about.name}`,
        sub: `Back to your ${about.from ?? "hand"} · nothing is spent`,
      };
    case "ability":
      return {
        word: `Cancel ${about.name}`,
        sub: "Its ability is not activated · nothing is spent",
      };
    case "trigger":
      return { word: `Cancel ${about.name}`, sub: "Its trigger does nothing" };
    default:
      return { word: "Cancel", sub: `Nothing is done with ${about.name}` };
  }
}

/**
 * Spec 0055 (owner 2026-11-06, "A · Say what it does") -- a target window
 * says what the card will do, from the card's own words the game sends:
 * the title is the action ("Deal 1 damage"), then the sentence made plain
 * ("Boggart Shenanigans may deal 1 damage to a player or planeswalker."),
 * then what to click; a "may" can be declined in words ("Don't deal 1
 * damage"). Null without words to go on (the window keeps "Choose a
 * target").
 */
export interface TargetWords {
  title: string | null;
  said: string;
  hint: string;
  decline: string | null;
}

const TITLE_MOST = 40;
const NOUN_END =
  /\s(?:gets?|gains?|deals?|reveals?|loses?|until|to|and|can't|becomes?|has|have|with|that|this|from|on|in|for)\b|\s?\(|[.,;]|$/;

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "target creature" -> "a creature", "two target creatures" -> "two creatures". */
export function plainTargets(text: string): string {
  return text
    .replace(/\b(one|two|three|four|five|X|\d+|up to \w+) target /gi, "$1 ")
    .replace(/\btarget (?=[aeiou])/gi, (m) => (m[0] === "T" ? "An " : "an "))
    .replace(/\btarget (?=\w)/gi, (m) => (m[0] === "T" ? "A " : "a "));
}

export function targetWords(prompt: string | null, name: string | null): TargetWords | null {
  if (!prompt) return null;
  let sentence = prompt.trim();
  // The worker's "Mogg Fanatic: It deals ..." form: the name, then the effect.
  if (name && sentence.startsWith(`${name}: `)) sentence = sentence.slice(name.length + 2);
  if (name) sentence = sentence.replace(/^(It|it) /, `${name} `);
  if (!/\btarget\b/i.test(sentence)) return null;

  // What to click: the words after the first "target" (or "any target").
  let hint: string;
  if (/\bany target\b/i.test(sentence)) {
    hint = "Click any creature, player or planeswalker.";
  } else {
    const after = sentence.slice(sentence.search(/\btarget\b/i) + "target ".length);
    const noun = after.slice(0, after.search(NOUN_END)).trim();
    const count = /\b(two|three|four|five|\d+|up to \w+) target\b/i.exec(sentence)?.[1];
    hint = noun
      ? `Click ${count ? count.toLowerCase() : /^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}.`
      : "Click a highlighted card or player.";
  }

  const said = capital(plainTargets(sentence));

  // The action: the sentence after the card's name ("may" set aside), its
  // verb made an instruction, cut before "to ..." or "until ...".
  let action = said;
  let optional = false;
  if (name && action.startsWith(`${name} `)) {
    action = action.slice(name.length + 1);
    if (action.startsWith("may ")) {
      optional = true;
      action = action.slice(4);
    }
    action = action.replace(/^(\w+?)(e?s)\b/, (whole, stem: string, end: string) =>
      /^(deal|destroy|return|exile|gain|get|lose|tap|untap|sacrifice|counter|draw|put|create|fight|attach)$/i.test(
        stem + (end === "es" ? "e" : ""),
      )
        ? stem + (end === "es" && !/^(gain|get|deal|draw|put)/i.test(stem) ? "e" : "")
        : whole,
    );
  }
  optional ||= /\bmay\b/i.test(said);
  action = action.replace(/\.$/, "");
  for (const cut of [" until ", " to "]) {
    const at = action.indexOf(cut);
    if (at > 0 && action.slice(0, at).trim().includes(" ")) action = action.slice(0, at);
  }
  const title = action.length > 0 && action.length <= TITLE_MOST ? capital(action) : null;
  return {
    title,
    said,
    hint,
    decline: optional && title ? `Don't ${title.charAt(0).toLowerCase()}${title.slice(1)}` : null,
  };
}
