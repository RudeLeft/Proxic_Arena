package net.barnflix.proxic

import java.util.Locale
import kotlin.math.ceil
import kotlin.math.roundToLong

/**
 * Spec 0114 -- the server's sentences as a player reads them
 * (docs/architecture/PLAYER_WORDS.md): counts of one to ten in a
 * sentence are words, bigger counts are digits; no "(s)", no code words,
 * no dashes, never the engine's name. The page's twin is
 * `frontend/src/words.ts`; the worker's is `PlainWords`.
 *
 * Every sentence a page shows word for word (an error's `detail`, a
 * refusal, an email line) that holds a count or a wait uses these, so no
 * route keeps its own number table.
 */
object PlayerWords {
    private val NUMBERS =
        listOf("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten")

    private const val SECONDS_PER_MINUTE = 60
    private const val MINUTES_PER_HOUR = 60
    private const val A_FEW_SECONDS = 30
    private const val ABOUT_A_MINUTE = 90
    private const val BYTES_PER_MB = 1024.0 * 1024.0

    /** "zero" to "ten" as words, else digits ("11", "1,000"). */
    fun number(n: Long): String = if (n in 0L..10L) NUMBERS[n.toInt()] else String.format(Locale.ROOT, "%,d", n)

    fun number(n: Int): String = number(n.toLong())

    /** "one card", "two cards", "12 cards". */
    fun count(
        n: Int,
        noun: String,
        many: String = noun + "s",
    ): String = "${number(n)} ${if (n == 1) noun else many}"

    /** First letter up, to begin a sentence: "Two cards". */
    fun capital(text: String): String = text.replaceFirstChar { it.titlecase(Locale.ROOT) }

    /**
     * How long a wait is, for "Try again in ...": "a few seconds", "a
     * minute", "about 15 minutes", "about an hour". Never "900 seconds"
     * and never "1 seconds".
     */
    fun waitWords(seconds: Long): String {
        if (seconds <= A_FEW_SECONDS) return "a few seconds"
        if (seconds <= ABOUT_A_MINUTE) return "a minute"
        val minutes = (seconds.toDouble() / SECONDS_PER_MINUTE).roundToLong()
        if (minutes < MINUTES_PER_HOUR) return "about ${number(minutes)} minutes"
        val hours = (minutes.toDouble() / MINUTES_PER_HOUR).roundToLong()
        return if (hours == 1L) "about an hour" else "about ${number(hours)} hours"
    }

    /** A size in whole megabytes, rounded up so a file one byte over its limit never reads as the limit. */
    fun megabytes(bytes: Long): String = "${ceil(bytes / BYTES_PER_MB).toLong()} MB"
}
