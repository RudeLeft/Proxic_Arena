package net.barnflix.proxic.deck

// Deck icons — spec 0012 (owner 2026-10-25).
//
// The owner's 100 icons, by name: the files the Deck Depot ships
// (frontend/src/assets/deck-icons/<name>.webp; DeckIconsTest checks the
// two lists agree). A deck stores one of these names, or none for the
// suggestion from its colours, which the page works out.

object DeckIcons {
    val NAMES: Set<String> =
        setOf(
            // Colours
            "sun", "water", "skull", "fire", "tree",
            "diamond", "five-gems", "prism", "snowflake", "storm-orb",
            // Pairs
            "wings-and-shield", "eye", "demon", "vine-axe", "antlers",
            "scales", "storm", "mushroom-skull", "sun-sword", "leaf-wave",
            // Strategy
            "crossed-swords", "shield-burst", "sword-and-shield", "three-rings", "winged-hourglass",
            "growing-crystals", "comet", "helmets", "claw-print", "scattered-book",
            // Plans
            "blinking-lion", "five-spears", "green-fist", "armoury", "angel-wings",
            "charging-beast", "venom-skull", "twin-blades", "fortress", "spiral-dagger",
            // Engines
            "golden-heart", "bleeding-heart", "altar", "rising-hand", "gravestone",
            "three-cards", "broken-card", "green-crystals", "floating-tree", "burning-book",
            // Permanents
            "gear-crystal", "rune-stone", "sword-and-helm", "amulet", "airship",
            "portal", "crown", "mountain-vale", "treasure-chest", "apple-pie",
            // Creatures
            "lion", "hound", "wolf", "eagle", "faerie",
            "hydra", "giant", "horror", "kraken", "fungus",
            // Families
            "dragon", "angel", "demon-lord", "zombie", "vampire",
            "elf", "goblin", "human", "soldier", "knight",
            // Families 2
            "merfolk", "spirit", "wizard", "rogue", "warrior",
            "cleric", "dryad", "dinosaur", "elemental", "boar",
            // Utility
            "scrying-lens", "twin-crystals", "stolen-gem", "vortex", "wheel-of-cards",
            "gift", "masks", "cage", "chaos-dice", "poison-fangs",
        )

    private const val WUBRG = "WUBRG"

    /**
     * A deck's colours: every colour in any of its cards' colour identity,
     * as Forge reported them, in WUBRG order ("" for a colourless deck).
     * Null when Forge said nothing about colour (no worker): unknown, so
     * the background fill asks again later.
     */
    fun deckColors(resolutions: Collection<CardResolution>): String? {
        val known = resolutions.mapNotNull { it.colors }
        if (known.isEmpty()) return null
        val letters = known.joinToString("").toSet()
        return WUBRG.filter { it in letters }
    }
}
