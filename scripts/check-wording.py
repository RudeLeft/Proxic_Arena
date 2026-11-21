"""The player's words follow the owner's rules, over whole games. Spec 0113, safety net 1.

    python -I scripts/check-wording.py [--res <forge res dir>] [--report-only] <trace.jsonl>...
    python -I scripts/check-wording.py --self-test
    python -I scripts/check-wording.py --source [--root <repo>] [--report-only]

--source (spec 0114, F-0114-E) reads the source instead of traces: every
player page's strings (frontend/src, through scripts/page-strings.mjs and
the frontend's own TypeScript, so frontend/node_modules must be installed),
every server string (server/src/main/kotlin) and the worker's deck-check
words (ForgeRuntime.Resolution), and fails on a dash (the type line's
excepted), "(s)", "colour" and "Forge". Admin pages, logs, exceptions,
comments and code (class names, SQL, CSS, imports) are left out; see
check_source.

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


# --- Spec 0114 F-0114-E: the source mode ------------------------------------------
#
# The player pages' strings (frontend/src, read by scripts/page-strings.mjs with
# the frontend's own TypeScript) and the server's sentences (every string in
# server/src/main/kotlin, read by the small Kotlin reader below) and the
# worker's deck-check words (ForgeRuntime.Resolution), with the same rules as
# the trace mode except the card-text ones (no card text lives in the source):
# a dash, "(s)", "colour", "Forge". Admin pages and logs are exempt (the owner:
# "admin and logs are exempt"), and so is what no player reads: comments, a
# log or exception call, a class name or other code attribute, an import.

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Admin pages (spec 0115) and development pages: no player reads them. /status
# (App.tsx) is admin-only since spec 0114 (W2-082).
PAGE_EXEMPT = re.compile(r"(^|/)(Admin(?!Only)[A-Za-z]*\.tsx|admin\.ts|App\.tsx|Dev[A-Za-z]*Page\.tsx|bench[A-Za-z]*\.ts"
                         r"|battlefield/fixture\.ts|battlefield/scenarios\.ts"
                         r"|test-setup\.ts|[^/]*\.test\.tsx?|[^/]*\.d\.ts)$")
# A string held by one of these is code, not words.
PAGE_CODE_HOLDERS = re.compile(
    r"^(import|type|index|key|case|compare|console\.[a-z]+|new (Error|TypeError|RangeError|URL|RegExp|Date)"
    r"|attr:(className|class|data-[\w-]+|href|src|type|role|id|htmlFor|key|name|style|rel|target|method|autoComplete"
    r"|inputMode|pattern|accept|viewBox|d|fill|stroke|transform|points|xmlns|lang|dir|mode|kind|sizes|srcSet)"
    r"|[\w.]*(querySelector|querySelectorAll|getElementById|addEventListener|removeEventListener|fetch|getItem"
    r"|setItem|removeItem|classList\.\w+|matchMedia|setAttribute|getAttribute|closest|startsWith|endsWith"
    r"|includes|split|replace|replaceAll|test|match|join|padStart|toLocaleDateString|toLocaleTimeString"
    r"|Intl\.\w+|send|postMessage|createElement|setProperty|getPropertyValue|track|mark|measure))$")
# The server: admin routes (spec 0115) are exempt; a log line, an exception's own
# message and a check's are logs, not words.
# AdminTool.kt is `arena-admin`, the administrator's command line.
SERVER_EXEMPT = re.compile(r"/admin/|/AdminTool\.kt$")
SERVER_CODE_HOLDERS = re.compile(
    r"^(([\w.]*\.)?(log|logger|LOG|\w*[lL]og)\.(trace|debug|info|warn|error)|println|print|error|check|require"
    r"|checkNotNull|requireNotNull|\w*Exception|\w*Error|Regex|toRegex|getenv|System\.getenv|getProperty"
    r"|System\.getProperty|env|header|appendHeader|Paths\.get|Path\.of|File|resolve|parameters|queryParameters"
    r"|split|startsWith|endsWith|contains|replace|substringAfter|substringBefore|removePrefix|removeSuffix"
    r"|prepareStatement|executeQuery|executeUpdate|sql|jsonPrimitive|getString|getInt"
    r"|getLong|getBoolean|getTimestamp|getObject|setString|containsKey|MDC\.put|withLoggingContext"
    # Logged only, never sent: a worker's failed start (MatchRuntime.start logs the detail and
    # sends the room the code, which the page words itself, lobby.ts matchFailed) and the
    # worker probe's reason (ForgeWorker.probe, the server log and the admin's Server tab).
    r"|WorkerStart\.Failed|Result\.Incompatible)$")
# Not words: CSS values and SQL.
NOT_WORDS = re.compile(r"\b(calc|translate|translateX|translateY|clamp|var|rgba?|hsla?|url|scale|rotate|cubic-bezier)\("
                       r"|^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER)\b|\bFROM\s+\w+\s|\bWHERE\b.*[<>=]")


def kotlin_strings(path):
    """Every string literal in a Kotlin file: (line, text, holders); "${...}" for a template hole."""
    src = open(path, encoding="utf-8", errors="replace").read()
    out = []
    i, n, line = 0, len(src), 1
    stack = []  # open calls: the word before each "(" still open

    def word_before(at):
        j = at - 1
        while j >= 0 and src[j] in " \t":
            j -= 1
        k = j
        while k >= 0 and (src[k].isalnum() or src[k] in "_."):
            k -= 1
        return src[k + 1:j + 1]

    def read_string(at, raw):
        nonlocal line
        quote = '"""' if raw else '"'
        j = at + len(quote)
        start_line = line
        text = []
        while j < n:
            if src.startswith(quote, j) and (not raw or not src.startswith('""""', j)):
                return j + len(quote), start_line, "".join(text)
            c = src[j]
            if c == "\n":
                line += 1
            if c == "\\" and not raw:
                text.append(src[j:j + 2])
                j += 2
                continue
            if src.startswith("${", j):
                depth, j = 1, j + 2
                while j < n and depth:
                    if src[j] == "{":
                        depth += 1
                    elif src[j] == "}":
                        depth -= 1
                    elif src[j] == "\n":
                        line += 1
                    j += 1
                text.append("${...}")
                continue
            text.append(c)
            j += 1
        return j, start_line, "".join(text)

    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            i += 1
        elif src.startswith("//", i):
            while i < n and src[i] != "\n":
                i += 1
        elif src.startswith("/*", i):
            end = src.find("*/", i + 2)
            end = n if end < 0 else end + 2
            line += src.count("\n", i, end)
            i = end
        elif src.startswith('"""', i):
            i, at, text = read_string(i, True)
            out.append((at, text, list(stack)))
        elif c == '"':
            i, at, text = read_string(i, False)
            out.append((at, text, list(stack)))
        elif c == "'":
            end = i + 1
            while end < n and src[end] != "'":
                end += 2 if src[end] == "\\" else 1
            i = end + 1
        elif c == "(":
            stack.append(word_before(i))
            i += 1
        elif c == ")":
            if stack:
                stack.pop()
            i += 1
        else:
            i += 1
    return out


def source_rules(text):
    """The rules a source string breaks (no card text lives in the source)."""
    hits = []
    for m in DASH.finditer(text):
        # The printed type line keeps its dash ("Creature — Goblin"), as in the trace mode.
        if TYPE_LINE.search(text[:m.start()].rstrip()) and m.group(0).strip() == "—":
            continue
        hits.append(("dash", repr(m.group(0))))
        break
    if "(s)" in text:
        hits.append(("maybe", "(s)"))
    if re.search(r"colour", text, re.I):
        hits.append(("colour", "colour"))
    if re.search(r"\bforge\b", text, re.I):
        hits.append(("forge", "Forge"))
    return hits


def words_like(text):
    """A string a person reads: two words or more, not a path, a class list or a code."""
    t = text.strip()
    if " " not in t or not re.search(r"[A-Za-z]{2}", t) or NOT_WORDS.search(t):
        return False
    if re.fullmatch(r"[\w\-:./ ${}…]*", t) and not re.search(r"[A-Z][a-z]+ [a-z]", t) and " - " not in t \
            and "Forge" not in t:
        return False  # "pa-notice pa-notice-warn", "a b c": class lists and ids
    return True


def page_strings(files, node="node"):
    import subprocess
    script = os.path.join(ROOT, "scripts", "page-strings.mjs")
    found = []
    for at in range(0, len(files), 200):
        run = subprocess.run([node, script, *files[at:at + 200]], capture_output=True, text=True,
                             encoding="utf-8", check=False)
        if run.returncode != 0:
            raise SystemExit(f"page-strings.mjs failed: {run.stderr.strip()}")
        for row in run.stdout.splitlines():
            found.append(json.loads(row))
    return found


def check_source(root=ROOT, node="node"):
    """Returns (hits, strings read): hits are (file, line, rule, detail, text)."""
    pages = []
    for base, _, names in os.walk(os.path.join(root, "frontend", "src")):
        if "node_modules" in base:
            continue
        for name in names:
            path = os.path.join(base, name)
            rel = os.path.relpath(path, root).replace("\\", "/")
            if name.endswith((".ts", ".tsx")) and not PAGE_EXEMPT.search(rel):
                pages.append(path)
    hits, read = [], 0
    for s in page_strings(sorted(pages), node):
        if PAGE_CODE_HOLDERS.match(s["where"]) or not words_like(s["text"]):
            continue
        read += 1
        for rule, detail in source_rules(s["text"]):
            rel = os.path.relpath(os.path.join(ROOT, s["file"]), root).replace("\\", "/")
            hits.append((rel, s["line"], rule, detail, s["text"]))
    kotlin = []
    for base, _, names in os.walk(os.path.join(root, "server", "src", "main", "kotlin")):
        for name in names:
            path = os.path.join(base, name)
            if name.endswith(".kt") and not SERVER_EXEMPT.search(path.replace("\\", "/")):
                kotlin.append(path)
    worker = os.path.join(root, "forge-worker", "src", "main", "java", "net", "barnflix", "proxic", "worker",
                          "ForgeRuntime.java")
    for path in sorted(kotlin) + ([worker] if os.path.exists(worker) else []):
        rel = os.path.relpath(path, root).replace("\\", "/")
        strings = kotlin_strings(path)
        if path == worker:
            strings = resolution_strings(path)
        for line, text, holders in strings:
            if any(SERVER_CODE_HOLDERS.match(h) for h in holders if h) or not words_like(text):
                continue
            read += 1
            for rule, detail in source_rules(text):
                hits.append((rel, line, rule, detail, text))
    return hits, read


def resolution_strings(path):
    """The worker's deck-check words: the strings inside ForgeRuntime's Resolution class (F-0114-B)."""
    src = open(path, encoding="utf-8", errors="replace").read()
    start = src.find("public static final class Resolution")
    if start < 0:
        return []
    depth, at, end = 0, src.find("{", start), None
    for j in range(at, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                end = j
                break
    body = src[start:end]
    first = src.count("\n", 0, start) + 1
    body = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), body, flags=re.S)
    body = re.sub(r"//[^\n]*", "", body)
    return [(first + body.count("\n", 0, m.start()), m.group(1), [])
            for m in re.finditer(r'"((?:[^"\\\n]|\\.)*)"', body)]


def source_self_test():
    """One case per source rule and exemption, on files written to a temporary tree."""
    import tempfile
    cases = []
    with tempfile.TemporaryDirectory() as tmp:
        def write(rel, text):
            path = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(text)
        write("frontend/src/Page.tsx",
              'import x from "a - b";\n'
              'export const A = () => <p className="pa-a pa-b">Forge Runtime is down</p>;\n'
              'export const B = `Choose a colour for ${"x"} now`;\n'
              'export const C = "Pick card(s) to keep";\n'
              'export const D = "Ready — go now";\n'
              '// Forge said - colour (s)\n'
              'console.log("Forge stopped - now");\n'
              'export const E = "Two cards in your hand";\n')
        write("frontend/src/AdminPage.tsx", 'export const F = "Forge Runtime here";\n')
        write("frontend/src/Page.test.tsx", 'export const G = "Forge Runtime here";\n')
        write("server/src/main/kotlin/x/Deck.kt",
              'val a = ErrorResponse("NOT_FOUND", "Forge does not know a card named \\"$name\\".")\n'
              'val b = ErrorResponse("BAD", "The deck has ${count} cards -- too many.")\n'
              'fun f() { log.warn("Forge worker died - restarting") }\n'
              '/* Forge - colour */\n'
              'val c = ErrorResponse("OK", "The deck has no cards in it.")\n'
              'val d = """\n  Choose a colour now\n"""\n')
        write("server/src/main/kotlin/x/admin/Admin.kt", 'val a = "Forge Runtime is here"\n')
        hits, read = check_source(tmp)
        got = sorted((h[0].split("/")[-1], h[2]) for h in hits)
        cases.append(("source rules and exemptions", got, sorted([
            ("Page.tsx", "forge"), ("Page.tsx", "colour"), ("Page.tsx", "maybe"), ("Page.tsx", "dash"),
            ("Deck.kt", "forge"), ("Deck.kt", "dash"), ("Deck.kt", "colour")])))
        cases.append(("plain words are read", read >= 9, True))
    failed = 0
    for name, got, want in cases:
        ok = got == want
        failed += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {name}: {got}{'' if ok else f' (wanted {want})'}")
    return failed


def main_source(argv):
    root = ROOT
    if "--root" in argv:
        root = argv[argv.index("--root") + 1]
    hits, read = check_source(root)
    for file, line, rule, detail, text in hits:
        print(f"{file}:{line}: {rule} ({detail}): {text!r}")
    print(f"check-wording --source: {read} player strings read; {len(hits)} hits "
          f"({dict(Counter(h[2] for h in hits)) or 'none'})")
    if read == 0:
        return 2
    return 1 if hits and "--report-only" not in argv else 0


def main(argv):
    if "--self-test" in argv:
        failed = self_test()
        return 1 if failed or source_self_test() else 0
    if "--source" in argv:
        return main_source(argv)
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
