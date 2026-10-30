package net.barnflix.proxic.report

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Spec 0039 — a report's README.md: the report in plain words, written
 * to be handed to Claude with the rest of the zip, saying which file holds
 * what and where the moment of the report is.
 */
internal object ReportReadme {
    fun of(report: ReportDetail): String =
        buildString {
            val problem = report.kind == "PROBLEM"
            appendLine("# Proxic report #${report.number} — ${if (problem) "a problem" else "an idea"}")
            appendLine()
            appendLine("From **${report.username}**, sent ${report.createdAt}. Status: ${report.status}.")
            appendLine()
            if (problem) problem(report.answers) else idea(report.answers)
            appendLine()
            appendLine("## Their answers")
            answersOf(report).forEach(::appendLine)
            appendLine()
            appendLine("## What their page knew")
            contextOf(report.context).forEach(::appendLine)
            report.matchId?.let { appendLine("- **Match id:** $it") }
            if (report.adminNote.isNotBlank()) {
                appendLine()
                appendLine("## The admin's note")
                appendLine(report.adminNote)
            }
            appendLine()
            appendLine("## The files")
            files(report.files.map { it.name }.toSet()).forEach(::appendLine)
        }

    private fun StringBuilder.problem(a: JsonObject) {
        appendLine("## What happened")
        appendLine(a.text("happened").orEmpty())
        a.text("expected")?.takeIf { it.isNotBlank() }?.let {
            appendLine()
            appendLine("## What they expected")
            appendLine(it)
        }
    }

    private fun StringBuilder.idea(a: JsonObject) {
        appendLine("## The idea: ${a.text("title").orEmpty()}")
        a.text("want")?.takeIf { it.isNotBlank() }?.let(::appendLine)
        a.text("helps")?.takeIf { it.isNotBlank() }?.let {
            appendLine()
            appendLine("## What it would help with")
            appendLine(it)
        }
    }

    private fun answersOf(report: ReportDetail): List<String> {
        val a = report.answers
        val labelled =
            if (report.kind == "PROBLEM") {
                listOf(
                    "Where" to a["where"],
                    "Part of the game" to a["part"],
                    "Cards" to a["cards"],
                    "How much it got in the way" to a["impact"],
                    "Happened before" to a["before"],
                    "When" to a["when"],
                )
            } else {
                listOf("About" to a["about"], "How much it would matter" to a["matters"])
            }
        return labelled.mapNotNull { (label, value) -> line(label, value) }
    }

    private fun contextOf(c: JsonObject): List<String> =
        listOf(
            "Page" to c["page"],
            "Game" to c["game"],
            "Turn" to c["turn"],
            "Whose turn" to c["whose"],
            "Step" to c["step"],
            "Proxic" to c["version"],
            "Browser" to c["browser"],
            "Screen" to c["screen"],
        ).mapNotNull { (label, value) -> line(label, value) }

    private fun files(names: Set<String>): List<String> =
        buildList {
            if (Reports.BROWSER_LOG in names) {
                add(
                    "- `${Reports.BROWSER_LOG}` — their page, one JSON object a line ({t, kind, text}): clicks, " +
                        "questions, answers, boards, reconnects, errors. The moment they reported is its last " +
                        "lines (kind \"report\").",
                )
            }
            if (Reports.GAME_RECORD in names) {
                add(
                    "- `${Reports.GAME_RECORD}` — the whole game so far, BOTH players' hidden information " +
                        "(admins only): gzip, one line each {ms, from: worker|server|note, frame}.",
                )
            }
            if (Reports.SERVER_LOG in names) {
                add("- `${Reports.SERVER_LOG}` — the server's lines for this player and this game, last 30 minutes.")
            }
            if (Reports.ENGINE_ERRORS in names) {
                add("- `${Reports.ENGINE_ERRORS}` — the game engine's error output for this game.")
            }
            if (Reports.PICTURE in names) {
                add("- `${Reports.PICTURE}` — their screen when they pressed Report, or a picture they added.")
            }
            add("- `report.json` — this report as data.")
        }

    private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

    private fun line(
        label: String,
        value: JsonElement?,
    ): String? {
        val text =
            when (value) {
                is JsonArray -> value.joinToString(", ") { it.jsonPrimitive.content }
                is JsonPrimitive -> value.contentOrNull
                else -> null
            }?.trim()
        return text?.takeIf { it.isNotEmpty() }?.let { "- **$label:** $it" }
    }
}
