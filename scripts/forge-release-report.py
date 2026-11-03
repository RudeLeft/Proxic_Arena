"""What moving to a new Forge release would mean for us. Spec 0025.

    python3 -I scripts/forge-release-report.py OLD_DIR NEW_DIR OLD_TAG NEW_TAG
    python3 -I scripts/forge-release-report.py --self-test

OLD_DIR and NEW_DIR are checkouts of Forge at the release we play and the
new one (the Forge repository's own layout; only the paths read below are
needed). Prints the report, in Markdown, for the GitHub issue the Forge
release watch opens (.github/workflows/forge-watch.yml):

  - new player questions: methods added to Forge's PlayerController, each
    one a question Arena would have to ask (forge-questions.tsv and
    ForgeQuestionRecordTest enforce that once the pin moves);
  - new kinds of cost: Forge's ICostVisitor, the record's "C" rows, each a
    payment Arena would have to ask for;
  - whether each of our forge_patches/*.patch still applies, in order, each
    on top of the ones before, as the Dockerfile applies them;
  - cards added (by name: a card leaving Forge's upcoming/ folder is not
    new) and card scripts changed; sets added and sets gone;
  - cards gone: names in the release we play that the new one no longer
    has (removed or renamed), which a deck holding them would lose;
  - cards whose printing changes what they do: scripts with Variant: lines
    that change more than the name shown (FlavorName). A text count, close
    to what the worker asks Forge (spec 0024); the exact count comes with
    the move.

Reads Forge's files and reports; changes nothing (AGENTS VEND-005).
--self-test runs F-0025-A on two hand-made trees. Exit 0 when it passes.
"""
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join("forge-gui", "res", "cardsfolder")
EDITIONS = os.path.join("forge-gui", "res", "editions")
CONTROLLER = os.path.join(
    "forge-game", "src", "main", "java", "forge", "game", "player", "PlayerController.java"
)
COST_VISITOR = os.path.join(
    "forge-game", "src", "main", "java", "forge", "game", "cost", "ICostVisitor.java"
)
LIST_AT_MOST = 40

METHOD = re.compile(
    r"^\s*public\s+(?:abstract\s+)?(?:<[^>]+>\s+)?[\w<>\[\],.? ]+?\s+(\w+)\s*\(([^)]*)\)",
    re.MULTILINE,
)


def files_under(tree, sub):
    """Relative path -> file bytes, for every file under tree/sub."""
    base = os.path.join(tree, sub)
    out = {}
    for folder, _, names in os.walk(base):
        for name in names:
            path = os.path.join(folder, name)
            with open(path, "rb") as f:
                out[os.path.relpath(path, base).replace(os.sep, "/")] = f.read()
    return out


def card_name(script):
    match = re.search(rb"^Name:(.+)$", script, re.MULTILINE)
    return match.group(1).decode("utf-8", "replace").strip() if match else "?"


def set_code(edition, path):
    match = re.search(rb"^Code=(.+)$", edition, re.MULTILINE)
    return match.group(1).decode("utf-8", "replace").strip() if match else os.path.splitext(path)[0]


def changes_by_printing(script):
    """A Variant: line that changes more than the name shown."""
    keys = re.findall(rb"^Variant:[^:\r\n]+:([A-Za-z]+)", script, re.MULTILINE)
    return any(key != b"FlavorName" for key in keys)


def java_source(tree, rel):
    """The file without its comments, or None when Forge has moved it."""
    path = os.path.join(tree, rel)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8", errors="replace") as f:
        return re.sub(r"//[^\n]*|/\*.*?\*/", "", f.read(), flags=re.DOTALL)


def questions(tree):
    """Each public PlayerController method, as name(parameter types); None if not found."""
    source = java_source(tree, CONTROLLER)
    if source is None:
        return None
    found = set()
    for name, params in METHOD.findall(source):
        types = []
        for param in filter(None, (p.strip() for p in re.split(r",(?![^<]*>)", params))):
            types.append(re.sub(r"\s+", "", param.rsplit(None, 1)[0]) if " " in param else param)
        found.add(f"{name}({', '.join(types)})")
    return found


def cost_kinds(tree):
    """Each kind of cost Forge's ICostVisitor visits (the record's C rows); None if not found."""
    source = java_source(tree, COST_VISITOR)
    if source is None:
        return None
    return set(re.findall(r"\bvisit\s*\(\s*(\w+)", source))


def git_apply(tree, patch, *flags):
    result = subprocess.run(
        ["git", "apply", "--whitespace=nowarn", *flags, os.path.abspath(patch)],
        cwd=tree,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def patches_apply(tree, paths):
    """Each patch in order on top of those before it, as the Dockerfile does.

    Name -> True when it applies. The tree is left as it was: what was
    applied is taken back off, last first.
    """
    applied, result = [], {}
    for path in paths:
        result[os.path.basename(path)] = git_apply(tree, path)
        if result[os.path.basename(path)]:
            applied.append(path)
    for path in reversed(applied):
        git_apply(tree, path, "-R")
    return result


def compare(what, before, now, new_words, gone_words, lines):
    """Lines for a set of things Forge has (questions, kinds of cost)."""
    if before is None or now is None:
        lines.append(
            f"- **{what}:** not checked -- Forge's file for them was not found "
            f"in {'the release we play' if before is None else 'the new release'}. "
            "Check by hand before moving."
        )
        return
    added, gone = now - before, before - now
    if added:
        lines.append(f"- **{what}: {len(added)} new.** {new_words}")
        lines += bullet_list(added)
    else:
        lines.append(f"- **{what}:** none new.")
    if gone:
        lines.append(f"- **{what} gone (or changed): {len(gone)}.** {gone_words}")
        lines += bullet_list(gone)


def bullet_list(items):
    items = sorted(items)
    shown = [f"  - {item}" for item in items[:LIST_AT_MOST]]
    if len(items) > LIST_AT_MOST:
        shown.append(f"  - …and {len(items) - LIST_AT_MOST} more")
    return shown


def report(old, new, old_tag, new_tag, patches_dir):
    old_cards, new_cards = files_under(old, CARDS), files_under(new, CARDS)
    changed = [p for p in new_cards if p in old_cards and new_cards[p] != old_cards[p]]
    old_editions, new_editions = files_under(old, EDITIONS), files_under(new, EDITIONS)
    old_codes = {set_code(old_editions[p], p) for p in old_editions}
    new_codes = {set_code(new_editions[p], p) for p in new_editions}
    new_sets, gone_sets = sorted(new_codes - old_codes), sorted(old_codes - new_codes)

    # By name, not by file: a script moved to another file (as cards leave
    # Forge's upcoming/ folder at release) is neither new nor gone.
    # A script with no Name: line (a split card built from its faces' own
    # scripts) is named "?" and left out.
    old_names = {card_name(s) for s in old_cards.values()} - {"?"}
    new_names = {card_name(s) for s in new_cards.values()} - {"?"}
    added_cards, gone_cards = new_names - old_names, old_names - new_names

    old_variants = {card_name(s) for s in old_cards.values() if changes_by_printing(s)}
    new_variants = {card_name(s) for s in new_cards.values() if changes_by_printing(s)}

    patches = sorted(
        os.path.join(patches_dir, p) for p in os.listdir(patches_dir) if p.endswith(".patch")
    )

    lines = [f"Forge **{new_tag}** is out. We play **{old_tag}**.", ""]
    lines.append("**What moving to it would mean for us**")
    lines.append("")
    compare(
        "New questions for players",
        questions(old),
        questions(new),
        "Each needs a page (and a Mechanics Lab game) before we can move:",
        "Forge no longer asks these, or asks them differently:",
        lines,
    )
    compare(
        "Kinds of cost to pay",
        cost_kinds(old),
        cost_kinds(new),
        "Each is a payment players would have to be asked for before we can move:",
        "Forge no longer has these, or calls them differently:",
        lines,
    )
    if patches:
        applies = patches_apply(new, patches)
        words = [
            f"{name.split('-')[0]} {'applies cleanly' if ok else '**no longer applies**'}"
            for name, ok in applies.items()
        ]
        lines.append(f"- **Our Forge patches**, in order: {'; '.join(words)}.")
    lines.append(
        f"- **New cards:** {len(added_cards)}, in {len(new_sets)} new set{'' if len(new_sets) == 1 else 's'}"
        + (f" ({', '.join(f'`{code}`' for code in new_sets[:LIST_AT_MOST])})" if new_sets else "")
        + f". {len(changed)} existing card scripts changed."
    )
    if gone_sets:
        lines.append(
            f"- **Sets Forge removed or renamed: {len(gone_sets)}** "
            f"({', '.join(f'`{code}`' for code in gone_sets[:LIST_AT_MOST])}). "
            "A printing from one would need another set once we move."
        )
    if gone_cards:
        lines.append(
            f"- **Cards Forge removed or renamed: {len(gone_cards)}.** A deck holding one "
            "would lose it when we move:"
        )
        lines += bullet_list(gone_cards)
    else:
        lines.append("- **Cards Forge removed or renamed:** none.")
    became = new_variants - old_variants
    stopped = old_variants - new_variants
    lines.append(
        f"- **Cards whose printing changes what they do:** {len(old_variants)} → {len(new_variants)}."
        + (" With spec 0024 these stay strict automatically once we move." if became else "")
    )
    if became:
        lines.append("  New:")
        lines += ["  " + line for line in bullet_list(became)]
    if stopped:
        lines.append("  No longer:")
        lines += ["  " + line for line in bullet_list(stopped)]
    lines += [
        "",
        f"Release notes: https://github.com/Card-Forge/forge/releases/tag/{new_tag}",
        "",
        "Nothing has changed on the site: it keeps playing "
        f"{old_tag} until we decide to move (AGENTS VEND-002, VEND-005). "
        "The card counts are read from Forge's files; the exact count of "
        "printing-dependent cards is measured when the pin moves.",
    ]
    return "\n".join(lines) + "\n"


# --- F-0025-A ------------------------------------------------------------------------


def write(tree, rel, text):
    path = os.path.join(tree, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def self_test():
    controller_old = """package forge.game.player;
public abstract class PlayerController {
    public abstract boolean confirmAction(SpellAbility sa, String mode, String message);
    // public abstract void commentedOut(int x);
    public abstract List<Card> chooseCardsForEffect(CardCollectionView sourceList, SpellAbility sa, String title, int min, int max, boolean isOptional, Map<String, Object> params);
}
"""
    controller_new = controller_old.replace(
        "}\n", "    public abstract String chooseSticker(Player p, List<String> names);\n}\n"
    )
    gameaction = "line one\nline two\nline three\n"
    with tempfile.TemporaryDirectory() as tmp:
        old, new, patches = (os.path.join(tmp, d) for d in ("old", "new", "patches"))
        for tree, controller, action in (
            (old, controller_old, gameaction),
            (new, controller_new, gameaction.replace("line two", "line 2")),
        ):
            write(tree, CONTROLLER, controller)
            write(tree, "forge-game/GameAction.java", action)
            write(tree, f"{CARDS}/b/bolt.txt", "Name:Lightning Bolt\nManaCost:R\n")
            write(tree, f"{CARDS}/g/godzilla.txt", "Name:Monster\nVariant:A:FlavorName:Godzilla\n")
            write(tree, f"{CARDS}/s/sly_spy.txt", "Name:Sly Spy\nVariant:B:PT:2/2\n")
            write(tree, f"{EDITIONS}/Alpha.txt", "[metadata]\nCode=LEA\n")
        visitor = "public interface ICostVisitor<T> {\n    T visit(CostSacrifice cost);\n    T visit(CostDiscard cost);\n}\n"
        write(old, COST_VISITOR, visitor)
        write(new, COST_VISITOR, visitor.replace("}\n", "    T visit(CostSticker cost);\n}\n"))
        write(old, f"{EDITIONS}/Beta.txt", "[metadata]\nCode=LEB\n")
        write(new, f"{CARDS}/n/new_card.txt", "Name:New Card\nManaCost:G\n")
        write(new, f"{CARDS}/r/ride.txt", "Name:Bumper Cars\nVariant:A:Lights:2 3\n")
        write(new, f"{CARDS}/b/bolt.txt", "Name:Lightning Bolt\nManaCost:R\nOracle:changed\n")
        write(new, f"{EDITIONS}/Spider.txt", "[metadata]\nCode=SPM\n")
        # One card renamed, and one only moved to another file (not gone).
        write(old, f"{CARDS}/o/old_name.txt", "Name:Old Name\nManaCost:U\n")
        write(new, f"{CARDS}/n/new_name.txt", "Name:New Name\nManaCost:U\n")
        write(old, f"{CARDS}/m/moved.txt", "Name:Moved Card\nManaCost:B\n")
        write(new, f"{CARDS}/m/moved_card.txt", "Name:Moved Card\nManaCost:B\n")
        write(patches, "0001-still-fine.patch", """diff --git a/forge-game/GameAction.java b/forge-game/GameAction.java
--- a/forge-game/GameAction.java
+++ b/forge-game/GameAction.java
@@ -1,3 +1,3 @@
-line one
+line ONE
 line 2
 line three
""")
        write(patches, "0002-gone-stale.patch", """diff --git a/forge-game/GameAction.java b/forge-game/GameAction.java
--- a/forge-game/GameAction.java
+++ b/forge-game/GameAction.java
@@ -1,3 +1,3 @@
 line one
-line two
+line TWO
 line three
""")
        # Applies only on top of 0001, as the Dockerfile applies them.
        write(patches, "0003-needs-0001.patch", """diff --git a/forge-game/GameAction.java b/forge-game/GameAction.java
--- a/forge-game/GameAction.java
+++ b/forge-game/GameAction.java
@@ -1,3 +1,3 @@
-line ONE
+line Uno
 line 2
 line three
""")
        text = report(old, new, "forge-2.0.15", "forge-2.0.16", patches)
        with open(os.path.join(new, "forge-game/GameAction.java"), encoding="utf-8") as f:
            restored = f.read() == "line one\nline 2\nline three\n"
        os.remove(os.path.join(new, CONTROLLER))
        moved = report(old, new, "forge-2.0.15", "forge-2.0.16", patches)

    checks = [
        ("finds the new question", "New questions for players: 1 new." in text and "chooseSticker(Player, List<String>)" in text),
        ("finds the new kind of cost", "Kinds of cost to pay: 1 new." in text and "  - CostSticker" in text),
        ("a moved Forge file is said, not read as every question gone", "New questions for players:** not checked" in moved and "confirmAction" not in moved),
        ("ignores a commented-out method", "commentedOut" not in text),
        ("a patch that still applies", "0001 applies cleanly" in text),
        ("a patch that no longer applies", "0002 **no longer applies**" in text),
        ("a patch on top of the one before it", "0003 applies cleanly" in text),
        ("the patches are taken back off", restored),
        ("a set gone", "Sets Forge removed or renamed: 1** (`LEB`)" in text),
        ("the new cards (by name) and set", "New cards:** 3, in 1 new set (`SPM`)" in text),
        ("a renamed card is gone", "removed or renamed: 1.**" in text and "  - Old Name" in text),
        ("a card only moved to another file is not", "  - Moved Card" not in text),
        ("the changed card", "1 existing card scripts changed" in text),
        ("the new printing-dependent card", "1 → 2" in text and "  - Bumper Cars" in text),
        ("a name-only variant is not one", "Monster" not in text),
    ]
    failed = [name for name, ok in checks if not ok]
    for name, ok in checks:
        print(f"{'ok  ' if ok else 'FAIL'} {name}")
    if failed:
        print("\n" + text)
    return 1 if failed else 0


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if argv[1:] == ["--self-test"]:
        return self_test()
    if len(argv) != 5:
        print(__doc__, file=sys.stderr)
        return 2
    _, old, new, old_tag, new_tag = argv
    sys.stdout.write(report(old, new, old_tag, new_tag, os.path.join(ROOT, "forge_patches")))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
