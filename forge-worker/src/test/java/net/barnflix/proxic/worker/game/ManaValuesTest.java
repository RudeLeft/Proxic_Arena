package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import forge.StaticData;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.card.CardFactory;
import forge.game.replacement.ReplacementEffect;
import forge.game.spellability.SpellAbility;
import forge.item.PaperCard;
import net.barnflix.proxic.worker.ForgeRuntime;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Spec 0092 (F-0092-B) -- the colour a mana ability made is never a report
 * window; a real choice still is. The abilities are Forge's own, read from
 * the real card scripts, so the test asks what Forge says the ability is
 * rather than restating it. The game itself (Bob taps Dismal Backwater and
 * Birds, Alice gets no window; Voice of All's colour still gives one) is
 * scripts/check-card-actions.py and the browser's match-mana-colours spec.
 */
class ManaValuesTest {

    @BeforeAll
    static void loadForge() {
        List<Path> candidates = new ArrayList<>();
        String given = System.getProperty("forge.res", System.getenv("FORGE_RES"));
        if (given != null) {
            candidates.add(Path.of(given));
        }
        candidates.add(Path.of("..", "spikes", "forge-phase0a", "forge-upstream", "forge-gui", "res"));
        candidates.add(Path.of("/forge/forge-gui/res"));
        Path res = candidates.stream().filter(p -> Files.isDirectory(p.resolve("cardsfolder"))).findFirst()
                .orElseThrow(() -> new AssertionError("Forge's resources not found in " + candidates
                        + " -- set -Dforge.res=<forge-gui/res>"));
        new ForgeRuntime(new File(res.toAbsolutePath().toString())).ensureLoaded();
    }

    private static Card card(String name) {
        PaperCard paper = StaticData.instance().getCommonCards().getCard(name);
        assertNotNull(paper, name + " is not in Forge's cards");
        // A real id: Forge leaves a negative-id (view-only) card without its abilities.
        return CardFactory.getCard(paper, null, 1, null);
    }

    private static SpellAbility manaAbility(String name) {
        Card card = card(name);
        assertFalse(card.getManaAbilities().isEmpty(), name + " has no mana ability");
        return card.getManaAbilities().get(0);
    }

    @Test
    void aGainLandTappedForBlackIsNotAWindow() {
        SpellAbility tap = manaAbility("Dismal Backwater");
        assertTrue(MatchController.isManaValue(tap), "Dismal Backwater's {U} or {B}");
        // Its ability is not an arrival either: no "-> battlefield" under a land already there.
        assertFalse(ActionReports.arrives(tap));
    }

    @Test
    void birdsOfParadiseTappedForGreenIsNotAWindow() {
        assertTrue(MatchController.isManaValue(manaAbility("Birds of Paradise")));
    }

    @Test
    void voiceOfAllsColourIsStillAWindowAndItArrived() {
        Card voice = card("Voice of All");
        SpellAbility choose = null;
        for (ReplacementEffect re : voice.getReplacementEffects()) {
            SpellAbility sa = re.ensureAbility();
            if (sa != null && sa.getApi() == ApiType.ChooseColor) {
                // As Forge's ReplacementHandler does when the replacement applies.
                sa.setReplacementEffect(re);
                choose = sa;
            }
        }
        assertNotNull(choose, "Voice of All's \"as it enters, choose a color\"");
        assertFalse(MatchController.isManaValue(choose));
        assertTrue(ActionReports.arrives(choose), "Voice of All arrives on the battlefield");
        // The creature spell itself, if the colour is told while it resolves.
        SpellAbility spell = voice.getFirstSpellAbility();
        assertNotNull(spell);
        assertFalse(MatchController.isManaValue(spell));
        assertTrue(ActionReports.arrives(spell));
    }

    @Test
    void noAbilityIsNoManaValue() {
        assertFalse(MatchController.isManaValue(null));
        assertFalse(ActionReports.arrives(null));
    }
}
