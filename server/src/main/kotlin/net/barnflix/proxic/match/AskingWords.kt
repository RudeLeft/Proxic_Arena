package net.barnflix.proxic.match

/**
 * Phase 9 Amendment 21 — what the asked player is doing, for everyone
 * else's waiting line: "Splitting the cards", "Choosing a pile". Only
 * choices every player can see anyway, each a fixed word chosen here;
 * nothing of the question itself (its words, its options, its kind)
 * travels. "Choosing" for any other choice, so the line can say "Making a
 * choice for your Fact or Fiction" instead of "May respond" — null for
 * priority, when they ARE being given a chance to respond.
 */
fun doingWord(request: DecisionRequest): String? {
    val arrange = request.arrange
    return when {
        request.kind == "chooseSpellAbilityToPlay" -> null
        arrange?.containsKey("split") == true -> "Splitting the cards"
        arrange?.containsKey("piles") == true -> "Choosing a pile"
        request.kind == "declareAttackers" || request.kind == "chooseDefender" -> "Choosing attackers"
        request.kind == "declareBlockers" || request.kind == "chooseBlockTarget" -> "Choosing blockers"
        request.kind == "chooseSector" -> "Choosing a sector"
        request.kind == "chooseSingleCardFace" && arrange?.containsKey("dungeons") == true -> "Choosing a dungeon"
        else -> "Choosing"
    }
}
