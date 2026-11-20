package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Phase 9 Amendment 21 — what the asked player is doing, for everyone
 * else's waiting line: "Splitting the cards", "Choosing a pile". Only
 * choices every player can see anyway, each a fixed word chosen here;
 * nothing of the question itself (its words, its options, its kind)
 * travels. "Choosing" for any other choice, so the line can say "Making a
 * choice for your Fact or Fiction" instead of "May respond" — null for
 * priority, when they ARE being given a chance to respond.
 *
 * Spec 0104 — [readerSeat], the seat the line is for: a choice from that
 * seat's own hand (the tray's `arrange` zone "hand" and owner, never the
 * prompt's English, PROTO-006) reads "Choosing from your hand" —
 * the same whether one card or two fit, so the count does not leak.
 */
fun doingWord(
    request: DecisionRequest,
    readerSeat: Int? = null,
): String? {
    val arrange = request.arrange
    val zone = (arrange?.get("zone") as? JsonPrimitive)?.contentOrNull
    val owner = (arrange?.get("owner") as? JsonPrimitive)?.intOrNull
    return when {
        request.kind == "chooseSpellAbilityToPlay" -> null
        arrange?.containsKey("split") == true -> "Splitting the cards"
        arrange?.containsKey("piles") == true -> "Choosing a pile"
        request.kind == "declareAttackers" || request.kind == "chooseDefender" -> "Choosing attackers"
        request.kind == "declareBlockers" || request.kind == "chooseBlockTarget" -> "Choosing blockers"
        request.kind == "chooseSector" -> "Choosing a sector"
        request.kind == "chooseSingleCardFace" && arrange?.containsKey("dungeons") == true -> "Choosing a dungeon"
        zone == "hand" && owner != null && readerSeat == owner && owner != request.authorisedSeat ->
            "Choosing from your hand"
        else -> "Choosing"
    }
}
