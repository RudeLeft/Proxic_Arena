package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonObjectBuilder

/**
 * How the page lays a question out: the worker's facts, passed through as
 * sent, to the asking seat only (the whole question goes to that seat and
 * nobody else, [decisionMessage]).
 */
internal fun JsonObjectBuilder.putLayout(request: DecisionRequest) {
    // Phase 9 W-07..W-10 -- how the tray lays the question out.
    request.arrange?.let { put("arrange", it) }
    // Spec 0070 -- the cards picked so far for a cost, and what it does to
    // them; the other player and spectators are told nothing until it is paid.
    request.picking?.let { put("picking", it) }
}
