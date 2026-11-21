"""The player's words follow the owner's rules, over whole games. Spec 0113, safety net 1.

    python -I scripts/check-wording.py [--res <forge res dir>] [--report-only] <trace.jsonl>...
    python -I scripts/check-wording.py --self-test

Reads every player-visible text field the worker sent in the traces'
DECISION_REQUEST, MATCH_SNAPSHOT (the report window, the reveal tray, the
stack, the play log, the notices, the act button's reason, payments,
players and the card fields), GAME_ENDED and ERROR frames -- never
Forge's own GAME_LOG, which goes only to the admin's game record --
with card and player names replaced by placeholders first, and fails on
(docs/architecture/PLAYER_WORDS.md):

  dash     an em or en dash, " -- " or a spaced hyphen " - ", except the
           printed type line ("Creature — Goblin") and printed card text
           quoted in a label (owner 2026-11-20, "Keep as printed":
           "Landfall —", "Choose one —", "Ward—{2}"): the words before the
           dash are matched against the card's own text -- its Forge
           script (with --res) and the printed-text fields the frames
           carry (keywords, modes, a room's or emblem's "says") --
           never against a sentence of our own
  number   a card number after a name, " (68)"
  maybe    Forge's "(s)" plural
  spaces   a double space
  colour   "colour" / "Colour" (the owner: "color")
  forge    the word "Forge"

Each hit is printed with its trace, frame and field. Exit 0 when there
are none (or with --report-only), 1 when there are, 2 when the traces
held no player text at all.
"""
import json
import os
import re
import sys
from collections import Counter

FRAMES = {"DECISION_REQUEST", "MATCH_SNAPSHOT", "GAME_ENDED", "ERROR"}

# A card's or a player's own name: replaced by a placeholder, never read.
NAME_KEYS = {"name", "source", "exiledBy", "faces", "locked", "fromName", "by", "displayName"}
# A card's printed text: kept as printed, and the source of what a label may quote.
PRINTED_KEYS = {"keywords", "gained", "says", "text", "oracle", "types"}
# Codes, ids, pictures and mana symbols: not words.
CODE_KEYS = {"actionId", "objectId", "id", "decisionId", "kind", "art", "image", "imageKey",
             "picture", "pictureKey", "set", "edition", "cost", "costNow", "manaCost", "makes",
             "symbol", "key", "messageId", "matchId", "type", "dir", "errorCode", "code",
             "workerVersion", "forgeCommit", "forgeRelease", "javaVersion", "detail", "step",
             "outcome", "zone", "owing", "colour", "color", "counter", "p", "c", "f", "z"}

TYPES = r"(?:Artifact|Battle|Creature|Enchantment|Instant|Land|Planeswalker|Sorcery|Dungeon|Kindred|Tribal|Conspiracy|Plane|Phenomenon|Scheme|Vanguard|Emblem)"
TYPE_LINE = re.compile(r"(?:(?:Legendary|Basic|Snow|World|Token|Ongoing|Host|Elite)\s+)*" + TYPES
                       + r"(?:\s+" + TYPES + r")*\s*$")
DASH = re.compile(r"[—–]| -- | - ")
# After a name (a placeholder, or a word with a capital): never a value, "power (5)".
CARD_NUMBER = re.compile(r"(?:«N»|\b[A-Z][^\s(),.:;]*) \(\d+\)")


def plain(text):
    return re.sub(r"\s+", " ", text.replace("–", "—")).strip()


class CardText:
    """The printed text of each card, from Forge's card scripts (by name) and the frames' printed fields."""

    def __init__(self, res=None):
        self.res = os.path.join(res, "cardsfolder") if res else None
        self.index = None
        self.texts = {}
        self.printed = set()

    def _file(self, name):
        stem = re.sub(r"[^a-z0-9 _]", "", name.lower().replace("-", " ")).strip().replace(" ", "_")
        stem = re.sub(r"_+", "_", stem)
        path = os.path.join(self.res, stem[:1], stem + ".txt")
        if os.path.exists(path):
            return path
        if self.index is None:
            self.index = {}
            for root, _, files in os.walk(self.res):
                for f in files:
                    p = os.path.join(root, f)
                    try:
                        with open(p, encoding="utf-8", errors="replace") as fh:
                            for line in fh:
                                if line.startswith("Name:"):
                                    self.index.setdefault(line[5:].strip(), p)
                    except OSError:
                        pass
        return self.index.get(name)

    def of(self, name):
        if not self.res or not name:
            return ""
        if name not in self.texts:
            path = None
            for one in name.split(" // "):
                p = self._file(one.strip())
                if p:
                    path = p
                    with open(p, encoding="utf-8", errors="replace") as fh:
                        self.texts[name] = self.texts.get(name, "") + plain(fh.read()) + " "
            if path is None:
                self.texts[name] = ""
        return self.texts[name]

    def quoted(self, text, at, names):
        """Is the dash at [at] in [text] the card's own printed dash: are the words before it printed?"""
        left = text[:at].rstrip()
        words = re.findall(r"[^\s·:.,;()]+", left)[-2:]
        if not words:
            return False
        for n in range(len(words), 0, -1):
            context = plain(" ".join(words[-n:]) + " —").replace(" —", "—")
            for printed in self.printed:
                if context in printed.replace(" —", "—"):
                    return True
            for name in names:
                if context in self.of(name).replace(" —", "—"):
                    return True
        return False


def walk(value, path, out, printed, names, key=None):
    if isinstance(value, dict):
        for k, v in value.items():
            walk(v, f"{path}.{k}", out, printed, names, k)
    elif isinstance(value, list):
        if key == "parts":
            # A play-log line: its pieces joined as the page joins them.
            # A player piece ({"player": 2}) is a name the page writes: a placeholder.
            line = "".join(p if isinstance(p, str)
                           else (p.get("name") or "«N»") if isinstance(p, dict) else ""
                           for p in value)
            for p in value:
                if isinstance(p, dict) and isinstance(p.get("name"), str):
                    names.add(p["name"])
            out.append((path, line.strip()))
            return
        for v in value:
            walk(v, f"{path}[]", out, printed, names, key)
    elif isinstance(value, str):
        if key in NAME_KEYS:
            names.add(value)
        elif key in PRINTED_KEYS or (key and path.endswith(".modes[].text")):
            printed.add(plain(value))
        elif key in CODE_KEYS or (key and ":" in key and not path.startswith("ERROR")):
            # ids as keys ("card:12") hold words: read those; plain code values are not.
            if key and ":" in key:
                out.append((path, value))
        elif " " in value.strip():
            out.append((path, value))


def rules(text, original, at_quoted):
    """The rules a placeholder-named string breaks, as (rule, detail)."""
    hits = []
    for m in DASH.finditer(original):
        left = original[:m.start()]
        if TYPE_LINE.search(left.rstrip()) and m.group(0).strip() in ("—", "-"):
            continue
        if at_quoted(original, m.start()):
            continue
        hits.append(("dash", repr(m.group(0))))
        break
    if CARD_NUMBER.search(text):
        hits.append(("number", CARD_NUMBER.search(text).group(0)))
    if "(s)" in text:
        hits.append(("maybe", "(s)"))
    if "  " in text.strip():
        hits.append(("spaces", "double space"))
    if re.search(r"colour", text, re.I):
        hits.append(("colour", "colour"))
    if re.search(r"\bforge\b", text, re.I):
        hits.append(("forge", "Forge"))
    return hits


def check_frames(frames, cards, label="trace"):
    """[frames]: (line number, frame). Returns (hits, strings read)."""
    names = set()
    found = []
    for number, frame in frames:
        t = frame.get("type")
        if t == "START_GAME":
            for p in frame.get("players", []) or []:
                if isinstance(p.get("name"), str):
                    names.add(p["name"])
                for c in p.get("cards", []) or []:
                    if isinstance(c, dict) and c.get("name"):
                        names.add(c["name"])
            continue
        if t not in FRAMES:
            continue
        out = []
        printed = set()
        walk(frame, t, out, printed, names)
        cards.printed |= printed
        for path, text in out:
            found.append((number, path, text))
    names = sorted((n for n in names if n and len(n) > 1), key=len, reverse=True)
    rx = re.compile("|".join(re.escape(n) for n in names)) if names else None
    hits = []
    for number, path, text in found:
        swapped = rx.sub("«N»", text) if rx else text
        quoted = lambda s, at: cards.quoted(s, at, names)  # noqa: E731
        for rule, detail in rules(swapped, text, quoted):
            hits.append((label, number, path, rule, detail, text))
    return hits, len(found)


def frames_of(path):
    for number, line in enumerate(open(path, encoding="utf-8", errors="replace"), 1):
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        frame = entry.get("frame") if isinstance(entry, dict) else None
        if isinstance(frame, dict) and entry.get("dir", "in") != "out":
            yield number, frame


def self_test():
    cards = CardText()
    cards.printed.add(plain("Landfall — Whenever a land you control enters, add one mana of any color."))
    cards.printed.add("Ward—{2}")

    def one(frame):
        hits, _ = check_frames([(1, {"type": "START_GAME", "players": [
            {"name": "Alice", "cards": [{"name": "Lotus Cobra"}, {"name": "Hazmat Suit (Used)"}]}]}), (2, frame)],
            cards, "self-test")
        return sorted({h[3] for h in hits})

    def ask(prompt, labels=()):
        return {"type": "DECISION_REQUEST", "prompt": prompt,
                "options": [{"actionId": f"a:{i}", "label": x} for i, x in enumerate(labels)]}

    cases = [
        ("a dash in a sentence of our own", ask("Crew 3: tap creatures — or Done."), ["dash"]),
        ("an en dash", ask("Pay optional costs.", ["Kicker – {2}{R}"]), ["dash"]),
        ("a double hyphen", ask("Choose a card -- or pass."), ["dash"]),
        ("a spaced hyphen", ask("Goblin Bangchuckers - Call coin flip"), ["dash"]),
        ("the type line", {"type": "MATCH_SNAPSHOT", "state": {"action": {
            "said": "Alice revealed a Creature — Goblin card."}}}, []),
        ("quoted card text keeps its dash", ask("Choose an ability.",
                                                ["Lotus Cobra · Landfall — Whenever a land you control enters"]), []),
        ("a keyword's printed title", ask("Choose.", ["Ward—{2}"]), []),
        ("a card number", ask("Change the target of Lightning Bolt (9)?"), ["number"]),
        ("a value in brackets is not a card number",
         ask("Exchange the roll of 5 with power (5) or toughness (3)?"), []),
        ("a card's own brackets are its name", ask("Hazmat Suit (Used) enters the battlefield."), []),
        ("(s)", ask("Choose card(s) to put into hand"), ["maybe"]),
        ("a double space", {"type": "MATCH_SNAPSHOT", "state": {"reveal": {
            "title": "Transformed cards in  Alice's battlefield"}}}, ["spaces"]),
        ("colour", ask("Choose a colour"), ["colour"]),
        ("Forge", {"type": "GAME_ENDED", "reason": "Forge stopped the game"}, ["forge"]),
        ("a play-log line, joined", {"type": "MATCH_SNAPSHOT", "state": {"playLog": [
            {"parts": [{"name": "Alice"}, " drew  ", "two cards"]}]}}, ["spaces"]),
        ("a player piece is a name", {"type": "MATCH_SNAPSHOT", "state": {"playLog": [
            {"parts": [{"player": 1}, " attacked ", {"player": 2}, " with Grizzly Bears"]}]}}, []),
                ("plain words pass", ask("Put two charge counters on Pentad Prism?", ["Yes", "No"]), []),
        ("GAME_LOG is not read", {"type": "GAME_LOG", "entries": ["Forge - colour (s)"]}, []),
    ]
    failed = 0
    for name, frame, want in cases:
        got = one(frame)
        ok = got == want
        failed += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {name}: {got}{'' if ok else f' (wanted {want})'}")
    print("self-test", "PASSED" if not failed else f"FAILED ({failed})")
    return 1 if failed else 0


def main(argv):
    if "--self-test" in argv:
        return self_test()
    report_only = "--report-only" in argv
    res = None
    files = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--res":
            res = argv[i + 1]
            i += 2
            continue
        if not a.startswith("--"):
            files.append(a)
        i += 1
    cards = CardText(res)
    total = 0
    all_hits = []
    for path in files:
        hits, read = check_frames(frames_of(path), cards, os.path.basename(path))
        total += read
        all_hits += hits
    by_rule = Counter(h[3] for h in all_hits)
    seen = set()
    for label, number, path, rule, detail, text in all_hits:
        key = (rule, path, re.sub(r"\d+", "N", text))
        if key in seen:
            continue
        seen.add(key)
        print(f"{label}:{number}: {rule} ({detail}) in {path}: {text!r}")
    print(f"check-wording: {total} player strings read in {len(files)} traces; "
          f"{len(all_hits)} hits ({dict(by_rule) or 'none'}), {len(seen)} distinct")
    if total == 0:
        return 2
    if all_hits and not report_only:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
