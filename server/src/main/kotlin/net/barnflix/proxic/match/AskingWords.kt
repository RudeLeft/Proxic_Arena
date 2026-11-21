package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/** Spec 0112 -- what the asked player is doing while they choose what to sacrifice. */
const val SACRIFICING = "Choosing what to sacrifice"

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
 *
 * Spec 0112 -- an "each player" sacrifice (Barter in Blood) reads "Choosing
 * what to sacrifice"; for a reader the game will ask next (the worker's
 * `nextSeats`, a seat list -- never the prompt's English, PROTO-006) it adds
 * " · you choose next". The same words whether the reader has two creatures
 * or ten. A spectator, or the reconnect path (no reader), gets the plain words.
 * A no-break space before the dot: a line too long for the act button wraps
 * after "·", never with "·" starting the second line.
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
        request.kind == "choosePermanentsToSacrifice" ->
            if (readerSeat != null && readerSeat in request.nextSeats) {
                "$SACRIFICING\u00A0· you choose next"
            } else {
                SACRIFICING
            }
        zone == "hand" && owner != null && readerSeat == owner && owner != request.authorisedSeat ->
            "Choosing from your hand"
        else -> "Choosing"
    }
}
