package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Spec 0113 (F-0113-C) -- the worker's rows of the wording table, each by
 * its id: the exact new words, from the plain functions that build them.
 */
class Words0113Test {

    private static ActionReports.Went went(String name, String place) {
        return new ActionReports.Went(name, place, false);
    }

    // --- Part 3: report windows ---------------------------------------------------------

    @Test
    void w1_141_theOwnersExample() {
        String putting = ActionReports.putting(List.of(
                went("Island", "into their graveyard"), went(null, "into their hand")), 0);
        assertEquals("RudeLeft looked at the top two cards of their library, putting an Island into their graveyard "
                + "and the other card into their hand.",
                ActionReports.topWords("RudeLeft", "looked at", "their", 2, putting));
    }

    @Test
    void w1_142_revealedTheTop() {
        assertEquals("Bob revealed the top four cards of their library, putting Goblin Matron into their hand and "
                + "the other three on the bottom.",
                ActionReports.topWords("Bob", "revealed", "their", 4,
                        ActionReports.putting(List.of(went("Goblin Matron", "into their hand")), 3)));
        assertEquals("Bob revealed the top card of their library.",
                ActionReports.topWords("Bob", "revealed", "their", 1, ""));
    }

    @Test
    void w1_140_searched() {
        assertEquals("putting a Forest onto the battlefield and a Forest into their hand",
                ActionReports.putting(List.of(went("Forest", "onto the battlefield"), went("Forest", "into their hand")),
                        0));
        assertEquals("putting two Forests onto the battlefield",
                ActionReports.putting(List.of(went("Forest", "onto the battlefield"),
                        went("Forest", "onto the battlefield")), 0));
    }

    @Test
    void w1_337_aFaceDownExile() {
        assertEquals("Alice looked at the top four cards of their library, exiling one face down and putting the "
                + "other three cards on the bottom of their library.",
                ActionReports.topWords("Alice", "looked at", "their", 4, ActionReports.putting(List.of(
                        new ActionReports.Went(null, "into exile", true),
                        went(null, "on the bottom of their library"), went(null, "on the bottom of their library"),
                        went(null, "on the bottom of their library")), 0)));
    }

    @Test
    void w1_143_reordered() {
        assertEquals("Bob looked at the top three cards of their library and put them back in the order they chose.",
                ActionReports.reorderWords("Bob", "their", 3, false, false));
        assertEquals("Bob looked at the top card of their library and put it back.",
                ActionReports.reorderWords("Bob", "their", 1, false, false));
    }

    @Test
    void w1_144_145_scry() {
        assertEquals("Bob scried 2 and kept both on top.", ActionReports.scryWords("Bob", 2, 2, 0));
        assertEquals("Bob scried 3, keeping one on top and putting two on the bottom.",
                ActionReports.scryWords("Bob", 3, 1, 2));
    }

    @Test
    void w1_146_surveil() {
        assertEquals("Bob surveilled 2, putting an Island into their graveyard and keeping the other card on top.",
                ActionReports.surveilWords("Bob", "their", 2, ActionReports.cardWords(List.of("Island"), 0), 1));
        assertEquals("Bob surveilled 1 and kept it on top.", ActionReports.surveilWords("Bob", "their", 1, null, 1));
    }

    @Test
    void w1_147_148_153_counts() {
        assertEquals("three cards", PlainWords.some(3, "card"));
        assertEquals("a card", PlainWords.some(1, "card"));
        assertEquals("two cards", ActionReports.cardWords(List.of(), 2));
    }

    @Test
    void w1_149_aHiddenCounteredSpell() {
        assertEquals("Alice countered a spell of yours.", ActionReports.counteredWords("Alice", "your", null));
        assertEquals("Alice countered your Grizzly Bears.",
                ActionReports.counteredWords("Alice", "your", "Grizzly Bears"));
    }

    @Test
    void w1_150_151_returned() {
        assertEquals("You exiled ten cards from Bob's graveyard.",
                ActionReports.exiledWords("You", ActionReports.cardWords(List.of(), 10), "Bob's graveyard"));
        assertEquals("Bob returned Grizzly Bears to their hand and exiled Lightning Bolt.",
                ActionReports.returnedWords("Bob", List.of(went("Grizzly Bears", "to their hand"),
                        went("Lightning Bolt", ActionReports.EXILED))));
        assertEquals("Bob returned Grizzly Bears.", ActionReports.returnedWords("Bob", List.of(went("Grizzly Bears",
                null))));
        assertEquals("Bob returned two cards to your hand.",
                ActionReports.returnedWords("Bob", List.of(went(null, "to your hand"), went(null, "to your hand"))));
    }

    @Test
    void w1_152_bounced() {
        assertEquals("Bob moved your Grizzly Bears.", ActionReports.bouncedWords("Bob",
                List.<String[]>of(new String[] {"moved", "your", "", "Grizzly Bears", "0"})));
        assertEquals("Bob put two cards on top of your library.", ActionReports.bouncedWords("Bob",
                List.<String[]>of(new String[] {"put", "your", "on top of your library", "", "2"})));
    }

    @Test
    void w1_154_157_cardWords() {
        assertEquals("Grizzly Bears and two other cards", ActionReports.cardWords(List.of("Grizzly Bears"), 2));
        assertEquals("Island and another card", ActionReports.cardWords(List.of("Island"), 1).replace("an Island",
                "Island"));
        assertEquals("three Goblin Pikers", ActionReports.named("Goblin Piker", 3));
        assertEquals("two Grizzly Bears", ActionReports.named("Grizzly Bears", 2));
        assertEquals("two copies of Light Up the Stage", ActionReports.named("Light Up the Stage", 2));
        assertEquals("an Island", ActionReports.named("Island", 1));
        assertEquals("Goblin Matron", ActionReports.named("Goblin Matron", 1));
        assertEquals("the other two cards", ActionReports.hiddenWords(2, true, true));
    }

    @Test
    void w1_155_zoneWords() {
        assertEquals("command zone", ActionReports.zoneWords(forge.game.zone.ZoneType.Command));
        assertEquals("hand", ActionReports.zoneWords(forge.game.zone.ZoneType.Hand));
    }

    @Test
    void w1_156_skip() {
        assertEquals("Bob's Fatespinner: you skip your next combat.",
                ActionReports.skipWords("Bob", "Fatespinner", null, Skips.stepWords("BeginCombat"), 0));
        assertEquals("Bob's Time Walk: you skip your next two turns.",
                ActionReports.skipWords("Bob", "Time Walk", null, null, 2));
        assertEquals("declare attackers step", Skips.stepWords("COMBAT_DECLARE_ATTACKERS"));
    }

    @Test
    void w1_158_159_316_320_values() {
        assertEquals("Alice won the flip.", MatchController.valueWords("Alice", "Karplusan Minotaur", "win"));
        assertEquals("Alice revealed the opponent they chose for Stalking Leonin: Bob.",
                MatchController.valueWords("Alice", "Stalking Leonin", "Alice reveals Bob"));
        assertEquals("Alice took the second pile.", MatchController.valueWords("Alice", "Fact or Fiction",
                "Alice chooses Pile 2:\nFact or Fiction\nFact or Fiction"));
        assertEquals("Bob raised the bid to 3 life.",
                MatchController.valueWords("Bob", "Mages' Contest", "topped bid with 3 life"));
        assertEquals("Bob voted for Grizzly Bears. Votes so far: Grizzly Bears, two (Alice and Bob).",
                MatchController.valueWords("Bob", "Tivadar's Crusade",
                        "Grizzly Bears (68)\r\nCurrent Votes:{Grizzly Bears (68)=[Alice, Bob]}"));
        assertNull(MatchController.valueWords("Bob", "Something", "Combat phase"));
    }

    @Test
    void w1_160_revealedBy() {
        assertEquals("Revealed by Goblin Ringleader", Causes.revealedBy("Goblin Ringleader"));
    }

    @Test
    void w1_161_328_330_366_367_revealTitles() {
        assertEquals("Looking at Alice's hand", PlainWords.revealTitle(null, false, "Alice's", "hand"));
        assertEquals("Alice's transformed cards",
                PlainWords.revealTitle("Transformed cards in ", true, "Alice's", "battlefield"));
        assertEquals("A face-down card left Alice's battlefield for their graveyard",
                PlainWords.revealTitle("Face-down card leaves the Alice's Battlefield:  Alice's graveyard", false,
                        "Alice's", "battlefield"));
        assertEquals("Ancestral Vision is suspended in Alice's exile with four time counters",
                PlainWords.revealTitle("Ancestral Vision is suspended with 4 time counters in ", true, "Alice's",
                        "exile"));
        assertEquals("Goblin Ringleader revealed cards from your library",
                PlainWords.revealTitle("Goblin Ringleader - Revealing cards from ", true, "your", "library"));
        assertEquals("Alice picked cards from Bob's library",
                PlainWords.revealTitle("Alice picked card(s) from ", true, "Bob's", "library"));
    }

    @Test
    void w1_162_revealSaid() {
        assertEquals("Pat revealed Llanowar Elves from their hand.",
                PlainWords.revealSaid("Pat", List.of("Llanowar Elves"), "hand"));
    }

    @Test
    void w1_163_265_321_327_why() {
        assertEquals("Grizzly Bears dealt combat damage to Bob", Causes.whyWords("DamageDone",
                Causes.labelled("Damage Source: Grizzly Bears, Damaged: Bob, Amount: 2"), true, null, "Alice"));
        assertEquals("Alice dealt 2 damage to Bob", Causes.whyWords("DamageDone",
                Causes.labelled("Damaged: Bob, Damage Source: Alice, Amount: 2"), false, null, "Alice"));
        assertEquals("A counter was removed from Invasion of Zendikar", Causes.whyWords("CounterRemoved",
                Causes.labelled("Removed from: Invasion of Zendikar Amount: 1"), false, null, "Alice"));
        assertEquals("Alice unlocked a door of Grand Entryway", Causes.whyWords("UnlockDoor",
                Causes.labelled("Player: Alice, Card: Grand Entryway // Elegant Rotunda"), false, null, "Alice"));
        assertEquals("Bob took the initiative", Causes.whyWords("TakesInitiative",
                Causes.labelled("Player: Bob,"), false, null, "Bob"));
        assertEquals("It is Alice's upkeep", Causes.whyWords("Phase", Causes.labelled("Phase: Alice"), false,
                "Upkeep", "Alice"));
        assertEquals("Trumpeting Gnarr mutated", Causes.whyWords("Mutates",
                Causes.labelled("Mutates: Trumpeting Gnarr"), false, null, "Alice"));
        assertEquals("Alice entered Trapped Entry", Causes.whyWords("RoomEntered",
                Causes.labelled("Room: Trapped Entry"), false, null, "Alice"));
        assertEquals("Lightning Bolt targeted The Serpent Society", Causes.whyWords("BecomesTarget",
                Causes.labelled("Source: Lightning Bolt, Target: The Serpent Society"), false, null, "Alice"));
        assertEquals("Goblin Token moved", Causes.whyWords("ChangesZone",
                Causes.labelled("Zone Changer: Goblin Token"), false, null, "Alice"));
    }

    // --- Part 3: the play log -------------------------------------------------------------

    @Test
    void w1_164_165_playLogLists() {
        JsonArray out = new JsonArray();
        List<com.google.gson.JsonElement> items = new java.util.ArrayList<>();
        JsonObject island = new JsonObject();
        island.addProperty("name", "Island");
        items.add(island);
        items.add(null);
        items.add(null);
        PlayLog.list(out, items, "a card", "cards");
        // One basic land is a kind of card: "An Island and two other cards" (it opens the list here).
        assertEquals("An ", out.get(0).getAsString());
        assertEquals("Island", out.get(1).getAsJsonObject().get("name").getAsString());
        assertEquals(" and two other cards", out.get(2).getAsString());
        assertEquals("seven cards", PlayLog.cards(7, "a card", "cards"));
    }

    @Test
    void w1_167_rolled() {
        assertEquals(" rolled 4 on a six-sided die", PlayLog.rolledWords(List.of(4), 6));
        assertEquals(" rolled 4, 5 and 6 on six-sided dice", PlayLog.rolledWords(List.of(4, 5, 6), 6));
        assertEquals(" rolled 17 on a 20-sided die", PlayLog.rolledWords(List.of(17), 20));
    }

    @Test
    void w1_168_175_poisonAndCounts() {
        assertEquals("two poison counters", PlayLog.cards(2, "a poison counter", "poison counters"));
    }

    @Test
    void w1_169_170_looked() {
        assertEquals(" scried 3, keeping one on top and putting two on the bottom",
                PlayLog.lookedWords(" scried ", 1, 2, "on the bottom"));
        assertEquals(" surveilled 2 and kept both on top", PlayLog.lookedWords(" surveilled ", 2, 0,
                "into their graveyard"));
        assertEquals(" surveilled 1 and put it into their graveyard", PlayLog.lookedWords(" surveilled ", 0, 1,
                "into their graveyard"));
    }

    @Test
    void w1_172_fizzleWhy() {
        assertEquals("its targets were gone", ActionReports.fizzleWhy(true, true));
        assertEquals("its target could no longer be chosen", ActionReports.fizzleWhy(false, false));
    }

    @Test
    void w1_177_tokens() {
        assertEquals("an", PlayLog.tokenCount(1, "Elf Warrior"));
        assertEquals("a", PlayLog.tokenCount(1, null));
        assertEquals("two", PlayLog.tokenCount(2, "Goblin"));
        assertEquals("12", PlayLog.tokenCount(12, "Goblin"));
    }

    @Test
    void controlChangeDuration() {
        assertEquals(" until the end of the turn", PlayLog.controlUntil("EOT"));
        assertEquals("", PlayLog.controlUntil(null));
    }

    @Test
    void w1_218_ante() {
        assertEquals("Ante isn't played, so every copy of Contract from Below and Darkpact was taken out of your deck.",
                MatchController.anteWords(List.of("Contract from Below", "Darkpact")));
    }

    // --- Part 4: questions, costs, buttons and reasons -------------------------------------

    @Test
    void w1_178_179_180_mulligan() {
        assertEquals("Keep this hand of seven cards, or mulligan?", MatchController.keepWords(7));
        assertEquals("Choose a card to put on the bottom (two to go).", MatchController.tuckWords(2));
        assertEquals("One", PlainWords.capitalNumber(1));
    }

    @Test
    void w1_182_270_newTarget() {
        assertEquals("New target for the copy of Lightning Bolt (now targeting Bob). Or pass to keep its targets.",
                MatchController.newTargetWords("Lightning Bolt", true, List.of("Bob"), true));
        assertEquals("New target for Lightning Bolt (now targeting Grizzly Bears).",
                MatchController.newTargetWords("Lightning Bolt", false, List.of("Grizzly Bears"), false));
    }

    @Test
    void w1_003_183_250_onTheStack() {
        assertEquals("Lightning Bolt on the stack", MatchController.onStackWords("Lightning Bolt", true));
        assertEquals("Slayer of the Wicked's ability", MatchController.onStackWords("Slayer of the Wicked", false));
        assertEquals(List.of("Slayer of the Wicked's ability (first)", "Slayer of the Wicked's ability (second)"),
                MatchController.targetLabels(List.of("Slayer of the Wicked's ability",
                        "Slayer of the Wicked's ability")));
    }

    @Test
    void w1_184_divide() {
        assertEquals("How much damage goes to Bob? (Five left to divide.)",
                MatchController.divideWords("DealDamage", "Bob", 5));
    }

    @Test
    void w1_189_253_310_lookingAt() {
        assertEquals("You are looking at Island, Island, Impulse and Impulse.",
                MatchController.revealedWords(null, List.of("Island", "Island", "Impulse", "Impulse"), 0));
        assertEquals("You are looking at Island and 44 more.",
                MatchController.revealedWords("You are looking at:", List.of("Island"), 44));
        assertEquals("Choose a card to put into your hand. You are looking at Island, Island, Impulse and Impulse.",
                PlainWords.forgeWords("Choose card(s) to put into hand You are looking at Island, Island, Impulse "
                        + "and Impulse."));
    }

    @Test
    void w1_193_manaCombo() {
        assertEquals("First of two mana: which color?", MatchController.manaComboWords(null, 1, 2, false));
        assertEquals("Second of three mana from Manamorphose, each a different color: which color?",
                MatchController.manaComboWords("Manamorphose", 2, 3, true));
    }

    @Test
    void w1_198_noHost() {
        assertEquals("Choose a pile.", MatchController.asked(null, "choose a pile."));
        assertEquals("Fact or Fiction: choose a pile.", MatchController.asked("Fact or Fiction", "choose a pile."));
    }

    @Test
    void w1_203_204_rolls() {
        assertEquals("4 and 5", MatchController.rollList(List.of(4, 5)));
    }

    @Test
    void w1_212_260_optionalCosts() {
        assertEquals("Kicker {2}{R}", MatchController.optionalCostWords("Kicker – {2}{R}"));
    }

    @Test
    void w1_216_yesLabel() {
        // The yes answer is still made from the question (the page reads its window title from it).
        assertEquals("Yes, use Grizzly Bears's triggered ability",
                MatchController.yesLabel("Use Grizzly Bears's triggered ability?"));
    }

    @Test
    void w1_219_262_331_332_350_actionWords() {
        assertEquals("2/2 creature", MatchController.actionWords("Creature 2 / 2", "hand", null));
        assertEquals("Play this land from the top of your library (Courser of Kruphix)",
                MatchController.actionWords("Play land by Courser of Kruphix (50)", "library", null));
        assertEquals("Cast it from exile (after Stomp)",
                MatchController.actionWords("Creature 4 / 3 by Stomp (41)", "exile", "Stomp"));
        assertEquals("Cast it by paying 1 life (Bolas's Citadel)", MatchController.actionWords(
                "Lightning Bolt deals 3 damage to any target. by Bolas's Citadel (21) (by paying 1 life instead of "
                        + "paying its mana cost)", "library", null));
        assertEquals("Grizzly Bears, a 2/2 creature (Gonti, Lord of Luxury)", MatchController.actionWords(
                "Grizzly Bears - Creature 2 / 2 by Gonti, Lord of Luxury (17) (may spend mana as though it were mana "
                        + "of any type)", "exile", null));
    }

    @Test
    void w1_220_costWhy() {
        assertEquals("Costs {1} less (Goblin Electromancer and Baral)",
                MatchController.costWhyWords("Costs {1} less", List.of("Goblin Electromancer", "Baral")));
    }

    @Test
    void w1_222_333_334_335_payFor() {
        assertEquals("Gempalm Incinerator goes to your graveyard, then: Gempalm Incinerator deals 2 damage.",
                PlainWords.payFor("cycling", "Gempalm Incinerator", "Gempalm Incinerator deals 2 damage.")[1]);
        assertEquals("for the face-down creature's ability",
                PlainWords.payFor("other", "the face-down creature", "")[0]);
        assertEquals("to use Mindslaver",
                PlainWords.payFor("other", "Mindslaver", "You control target player during that player's next turn.")[0]);
        assertEquals("to regenerate River Boa", PlainWords.payFor("other", "River Boa", "Regenerate River Boa.")[0]);
    }

    @Test
    void w1_223_243_costs() {
        assertEquals("two charge counters", PlainWords.counters(2, "CHARGE"));
        assertEquals("a +1/+1 counter", PlainWords.counters(1, "+1/+1"));
        assertEquals("two creatures", PlainWords.counted(2, "creature"));
        assertEquals("a creature", PlainWords.counted(1, "Creature"));
        assertEquals("two untapped creatures you control", PlainWords.counted(2, "untapped creature you control"));
        assertEquals("two Elves", PlainWords.counted(2, "Elf"));
        assertEquals("your graveyard", PlainWords.yourZone("graveyard"));
        assertEquals("a six-sided die", MatchCostDecision.diceWords(1, "6"));
        assertEquals("two six-sided dice", MatchCostDecision.diceWords(2, "6"));
        assertEquals("blood token", PlainWords.counterName("BLOOD_TOKEN"));
    }

    @Test
    void w1_244_discardLine() {
        assertEquals("Discard Gempalm Incinerator. Then Gempalm Incinerator deals 2 damage. You won't cast it.",
                PlainWords.discardLine("Gempalm Incinerator", "Gempalm Incinerator deals 2 damage.", false));
    }

    @Test
    void w1_246_nothingToPlay() {
        assertEquals("Two lands; no land in hand", PriorityStops.nothingToPlay(2, 0, false));
    }

    @Test
    void w1_249_stackDescription() {
        assertEquals("2/1 creature", PlainWords.stackDescription("Agent of Kotis (115)->Agent of Kotis - Creature 2 / 1",
                "Agent of Kotis"));
        assertEquals("Destroy target artifact.", PlainWords.stackDescription("Wear // Tear (12)->Destroy target artifact.",
                "Wear // Tear"));
        assertEquals("Arc Lightning deals 3 damage divided as you choose.", PlainWords.stackDescription(
                "Arc Lightning (101) - Arc Lightning deals 3 damage divided as you choose.", "Arc Lightning"));
    }

    @Test
    void w1_264_336_blockRefused() {
        assertEquals("Boggart Brute has menace: block it with two or more creatures.", CombatChoices.blockRefused(
                "Boggart Brute (38) cannot be blocked with 1 creatures you've assigned", java.util.Set.of("Boggart Brute")));
        assertEquals("Not allowed: Grizzly Bears can't block alone.",
                CombatChoices.blockRefused("Grizzly Bears (12) can't block alone."));
    }

    @Test
    void w1_309_313_343_348_362_365_forgeWords() {
        // Lead, from the F-0113-E rerun: Forge's count, its "(or: Sacrifices X)" and its "Creature 1 / 2".
        assertEquals("Choose one untapped Island to return to hand. (or sacrifice Lotus Atoll)",
                PlainWords.forgeWords("Choose 1 untapped Island to return to hand. (or: Sacrifices Lotus Atoll)"));
        assertEquals("Choose one land you don't control to gain control.",
                PlainWords.forgeWords("Choose 1 land you don't control to gain control."));
        assertEquals("Giant Killer · {0} · 1/2 creature (without paying its mana cost)",
                PlainWords.forgeWords("Giant Killer · {0} · Creature 1 / 2 (without paying its mana cost)"));
        assertEquals("Tap five untapped Elves you control", PlainWords.forgeWords("Tap five untapped Elfs you control"));
        assertEquals("two creatures", PlainWords.counted(2, "creature"));
        assertEquals("five Elves", PlainWords.counted(5, "Elf"));
        assertEquals("Goblin Bangchuckers: call the coin flip.",
                PlainWords.forgeWords("Goblin Bangchuckers - Call coin flip"));
        assertEquals("Choose which mana to make", PlainWords.forgeWords("Select Mana to Produce"));
        assertEquals("Choose a kind of counter to put on Savannah Lions.",
                PlainWords.forgeWords("Select counter type to add to Savannah Lions"));
        assertEquals("Change the target of Lightning Bolt?",
                PlainWords.forgeWords("Do you want to change targets of Lightning Bolt"));
        assertEquals("Spend three energy?", PlainWords.forgeWords("Do you want to spend 3 Energy counter"));
        assertEquals("Stop searching? You can still choose one more card.",
                PlainWords.forgeWords("Cancel Search? Up to 1 more card(s) can be selected."));
        assertEquals("Make Ebony Fly a 3/3 Insect artifact creature with flying until end of turn?",
                PlainWords.forgeWords("Ebony Fly has base power and toughness 3/3  and becomes an artifact creature "
                        + "Insect and  gains flying until end of turn."));
        assertEquals("Choose a card.", PlainWords.forgeWords("Choose a card "));
        assertEquals("Choose a card to meld with.", PlainWords.forgeWords("Choose card to meld with"));
        assertEquals("Which creature goes on top?", PlainWords.forgeWords("Choose which creature to be the top"));
        assertEquals("Choose a card to change the roll of 4.",
                PlainWords.forgeWords("Choose a card to modify die result 4"));
        assertEquals("Choose a creature to swap its power or toughness with the roll of 5.",
                PlainWords.forgeWords("Choose a card to swap its Power or Toughness with die result 5"));
        assertEquals("Choose a card from Bob's hand", PlainWords.forgeWords("Select a card from Bob's hand"));
        assertEquals("Choose up to two cards from your library (up to two, or pass)",
                PlainWords.forgeWords("Choose up to 2 cards from your library (up to two, or pass)"));
    }

    @Test
    void w1_338_342_347_brokenEnglish() {
        assertEquals("Tap five untapped Elves you control", PlainWords.forgeWords("Tap five untapped Elfs you control"));
        assertEquals("Untap two tapped creatures you control",
                PlainWords.forgeWords("Untap two  tapped creaturess you control"));
        assertEquals("Remove a counter from this creature", PlainWords.forgeWords("Remove a counter from a this creature"));
        assertEquals("exile another blue card", PlainWords.forgeWords("exile a other blue card"));
        assertEquals("You choose an instant or sorcery card from it.",
                PlainWords.forgeWords("You choose a instant or sorcery card from it."));
        assertEquals("Exile an instant or sorcery spell from the stack",
                PlainWords.forgeWords("Exile an instant or sorcery spell from stack"));
        assertEquals("a one-shot", PlainWords.forgeWords("a one-shot"));
    }

    // --- Safety net 2, wired on the board -------------------------------------------------

    @Test
    void theBoardsSentencesAreTidied() {
        JsonObject snapshot = new JsonObject();
        JsonObject action = new JsonObject();
        action.addProperty("said", "Bob vote Grizzly Bears (75)  now.");
        snapshot.add("action", action);
        JsonArray stack = new JsonArray();
        JsonObject entry = new JsonObject();
        entry.addProperty("description", "Draw 1 card(s).");
        entry.addProperty("name", "Hazmat Suit (Used)");
        stack.add(entry);
        snapshot.add("stack", stack);
        JsonArray log = new JsonArray();
        JsonObject line = new JsonObject();
        JsonArray parts = new JsonArray();
        parts.add(" drew  2 card(s) ");
        line.add("parts", parts);
        log.add(line);
        snapshot.add("playLog", log);
        GameHost.tidyTexts(snapshot, Map.<String, String>of().keySet());
        assertEquals("Bob vote Grizzly Bears now.", action.get("said").getAsString());
        assertEquals("Draw one card.", entry.get("description").getAsString());
        assertEquals("Hazmat Suit (Used)", entry.get("name").getAsString());
        assertEquals(" drew two cards ", parts.get(0).getAsString());
    }
}
