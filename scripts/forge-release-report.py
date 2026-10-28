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
  - whether each of our forge_patches/*.patch still applies;
  - card scripts added and changed, and edition files added;
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


def questions(tree):
    """Each public PlayerController method, as name(parameter types)."""
    path = os.path.join(tree, CONTROLLER)
    if not os.path.exists(path):
        return set()
    with open(path, encoding="utf-8", errors="replace") as f:
        source = re.sub(r"//[^\n]*|/\*.*?\*/", "", f.read(), flags=re.DOTALL)
    found = set()
    for name, params in METHOD.findall(source):
        types = []
        for param in filter(None, (p.strip() for p in re.split(r",(?![^<]*>)", params))):
            types.append(re.sub(r"\s+", "", param.rsplit(None, 1)[0]) if " " in param else param)
        found.add(f"{name}({', '.join(types)})")
    return found


def patch_applies(tree, patch):
    result = subprocess.run(
        ["git", "apply", "--check", "-p1", os.path.abspath(patch)],
        cwd=tree,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def bullet_list(items):
    items = sorted(items)
    shown = [f"  - {item}" for item in items[:LIST_AT_MOST]]
    if len(items) > LIST_AT_MOST:
        shown.append(f"  - …and {len(items) - LIST_AT_MOST} more")
    return shown


def report(old, new, old_tag, new_tag, patches_dir):
    old_cards, new_cards = files_under(old, CARDS), files_under(new, CARDS)
    added = [p for p in new_cards if p not in old_cards]
    changed = [p for p in new_cards if p in old_cards and new_cards[p] != old_cards[p]]
    old_editions, new_editions = files_under(old, EDITIONS), files_under(new, EDITIONS)
    new_sets = sorted(set_code(new_editions[p], p) for p in new_editions if p not in old_editions)

    old_variants = {card_name(s) for s in old_cards.values() if changes_by_printing(s)}
    new_variants = {card_name(s) for s in new_cards.values() if changes_by_printing(s)}

    asked_before, asked_now = questions(old), questions(new)
    new_questions = asked_now - asked_before
    gone_questions = asked_before - asked_now

    patches = sorted(p for p in os.listdir(patches_dir) if p.endswith(".patch"))

    lines = [f"Forge **{new_tag}** is out. We play **{old_tag}**.", ""]
    lines.append("**What moving to it would mean for us**")
    lines.append("")
    if new_questions:
        lines.append(
            f"- **New questions for players: {len(new_questions)}.** Each needs a page "
            "(and a Mechanics Lab game) before we can move:"
        )
        lines += bullet_list(new_questions)
    else:
        lines.append("- **New questions for players:** none.")
    if gone_questions:
        lines.append(f"- **Questions Forge no longer asks (or asks differently): {len(gone_questions)}:**")
        lines += bullet_list(gone_questions)
    if patches:
        words = [f"{p.split('-')[0]} {'applies cleanly' if patch_applies(new, os.path.join(patches_dir, p)) else '**no longer applies**'}" for p in patches]
        lines.append(f"- **Our Forge patches:** {'; '.join(words)}.")
    lines.append(
        f"- **New cards:** {len(added)}, in {len(new_sets)} new set{'' if len(new_sets) == 1 else 's'}"
        + (f" ({', '.join(f'`{code}`' for code in new_sets[:LIST_AT_MOST])})" if new_sets else "")
        + f". {len(changed)} existing card scripts changed."
    )
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
        write(new, f"{CARDS}/n/new_card.txt", "Name:New Card\nManaCost:G\n")
        write(new, f"{CARDS}/r/ride.txt", "Name:Bumper Cars\nVariant:A:Lights:2 3\n")
        write(new, f"{CARDS}/b/bolt.txt", "Name:Lightning Bolt\nManaCost:R\nOracle:changed\n")
        write(new, f"{EDITIONS}/Spider.txt", "[metadata]\nCode=SPM\n")
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
        text = report(old, new, "forge-2.0.15", "forge-2.0.16", patches)

    checks = [
        ("finds the new question", "New questions for players: 1" in text and "chooseSticker(Player, List<String>)" in text),
        ("ignores a commented-out method", "commentedOut" not in text),
        ("a patch that still applies", "0001 applies cleanly" in text),
        ("a patch that no longer applies", "0002 **no longer applies**" in text),
        ("the new cards and set", "New cards:** 2, in 1 new set (`SPM`)" in text),
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
