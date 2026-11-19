"""EVID-006 -- live docs name code by file and symbol, never by line number.

    python -I scripts/check-doc-refs.py [repo-root]
    python -I scripts/check-doc-refs.py --self-test

A line number in a doc goes stale the moment the code above it changes:
the ninth documentation pass spent 58 of its 79 fixes re-numbering
references like `Board.tsx:9420`. So every Markdown file outside
docs/history/ (frozen, PHASE-002) must name code by file plus a symbol --
a function, class, method, component, CSS selector, constant, test name or
Lab scenario -- not by line.

Flagged, outside fenced code blocks (quoted command output):
  - `file.ext:NNN`, `file.ext:NNN-MMM`
  - `file.ext ~NNN`, `file.ext lines NNN`, `file.ext LNNN`, `file.ext at line NNN`
    (also with a symbol between, e.g. `Board.tsx` `cardRow` ~1595)
  - `symbol` ~NNN / `symbol` lines NNN, and a bare `:NNN` carrying on from
    a file named earlier ("(`:904`)")
  - a bare `~NNN` closing its phrase ("(~2301)") in a paragraph that names
    a code file, and "at line NNN" in a sentence that names one

Allowed -- dated or commit-pinned evidence -- when the same sentence (or
table row) carries:
  - a commit sha (7-40 hex characters, with a letter and a digit), e.g. a
    failing test line quoted from CI run b621cd8;
  - the marker <!-- pinned --> (for evidence pinned some other way);
  - for "line NNN" only: the words sit inside a quoted log ("...").

Exit 0 when clean, 1 naming each offending reference.
"""
import os
import re
import subprocess
import sys

EXT = r"(?:tsx?|jsx?|mjs|cjs|java|kts?|css|py|ps1|sh|ya?ml|json|gradle|html|sql|md|toml|properties)"
FILE = r"[\w./-]*\w\." + EXT + r"\b"
# file.ext:NNN (optionally backticked: `file.ext`:NNN or `file.ext:NNN`)
COLON = re.compile(FILE + r"`?:~?\d+")
# file.ext [symbol] ~NNN / lines NNN / LNNN / at line NNN
NEAR = re.compile(FILE + r"`?,?\s*(?:`[^`\n]{1,60}`\s*,?\s*)?(?:~\s?|lines?\s+|at\s+lines?\s+|L)\d+\b")
# A code line's "~NNN" closes its phrase -- "(~2301)", "~2997, ~3281" --
# where a rough count runs on into its noun ("~23 distinct cards", "~611 MB").
TILDE = re.compile(r"(?<![\w.~])~\d{2,}(?:-\d+)?(?![\d,]*\d)(?=\s*[)\],;/:]|\.(?!\d)|\s*$|\s+(?:and|or|in|of|the|to)\b)")
# "at line NNN" -- not a bare "line 1" (a play log's first line is prose).
LINE = re.compile(r"\b(?:at|on|see)\s+lines?\s+\d+\b", re.IGNORECASE)
# A bare ":NNN" carrying on from a file named earlier: "(`:904`)", ", :1013".
# (Not after a plain space: "the local stack on :8080" is a port.)
BARE_COLON = re.compile(r"(?:(?<=[`(])|(?<=\d,\s))`?:\d{2,}(?:-\d+)?\b")
# A backticked symbol with a line: "`ViewerSnapshot` ~345-392", "`MagicStack` line 587".
SYMBOL_NEAR = re.compile(r"`[\w.$#]+`\s*(?:~\s?|lines?\s+|at\s+lines?\s+)\d+\b")
CODE_FILE = re.compile(FILE)
SHA = re.compile(r"\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}\b")
MARKER = "<!-- pinned -->"
QUOTED = re.compile(r'"[^"\n]*"|“[^”\n]*”')
FENCE = re.compile(r"^\s*(```|~~~)")
SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[^\s])")


def scopes(text):
    """Yield (line_number, scope_text, paragraph) for each sentence or table row.

    Paragraphs are joined first, so a sentence wrapped across lines is one
    scope; a table row is its own scope; fenced blocks are skipped."""
    lines = text.split("\n")
    fenced = False
    para = []  # (line_number, text)

    def flush():
        if not para:
            return
        joined, starts = "", []
        for number, t in para:
            starts.append((len(joined), number))
            joined += t + " "
        para.clear()
        pos = 0
        for piece in SENTENCE_END.split(joined):
            at = joined.find(piece, pos)
            pos = at + len(piece)
            number = max(n for off, n in starts if off <= max(at, 0))
            yield number, piece, joined

    for number, line in enumerate(lines, 1):
        if FENCE.match(line):
            yield from flush()
            fenced = not fenced
            continue
        if fenced:
            continue
        if not line.strip():
            yield from flush()
        elif line.lstrip().startswith("|"):
            yield from flush()
            yield number, line, line
        else:
            para.append((number, line))
    yield from flush()


def problems_in(text):
    """Every forbidden line-number reference in one document's text."""
    found = []
    for number, scope, paragraph in scopes(text):
        if MARKER in scope or SHA.search(scope):
            continue
        hits = [m.group(0) for m in COLON.finditer(scope)]
        for pattern in (NEAR, SYMBOL_NEAR, BARE_COLON):
            hits += [m.group(0) for m in pattern.finditer(scope) if not any(m.group(0) in h or h in m.group(0) for h in hits)]
        if CODE_FILE.search(paragraph):
            hits += [m.group(0) for m in TILDE.finditer(scope) if not any(m.group(0) in h for h in hits)]
        if CODE_FILE.search(scope):
            # "at line N" only beside a named file: a play log "starts at line 1" is prose.
            unquoted = QUOTED.sub('""', scope)
            hits += [m.group(0) for m in LINE.finditer(unquoted) if not any(m.group(0) in h for h in hits)]
        for hit in hits:
            found.append((number, hit.strip()))
    return found


def live_docs(root):
    try:
        out = subprocess.check_output(["git", "-C", root, "ls-files", "*.md"], text=True)
        names = [n for n in out.split("\n") if n]
    except (OSError, subprocess.CalledProcessError):
        names = []
        for dirpath, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "build", "dist")]
            names += [os.path.relpath(os.path.join(dirpath, f), root).replace(os.sep, "/") for f in files if f.endswith(".md")]
    return sorted(n for n in names if not n.startswith("docs/history/") and not n.startswith("frontend/zz-canvas/"))


def self_test():
    good = (
        "The beam's tone is set in `Board.tsx`, `studAt`'s stack pass.\n\n"
        "| `e2e/x.spec.ts` | failed at line 156 | CI b621cd8 | fixed |\n\n"
        "The run said \"Error at line 165\" in `x.spec.ts`.\n\n"
        "```\nBoard.tsx:9420 in quoted output\n```\n\n"
        "At 4a5acfe, `GameScreen.tsx:3707` held the report. A card ~250 px wide.\n\n"
        "Kept as evidence <!-- pinned --> `Moves.java:236`.\n\n"
        "The server listens on localhost:8080; `card:51` is an id.\n"
    )
    bad = (
        "The beam's tone (`Board.tsx:9420`).\n\n"
        "See `battlefield.css:2312-2353`.\n\n"
        "The tag (`Board.tsx` ~2997, ~3281).\n\n"
        "`Moves.java` lines 236-281 name it.\n\n"
        "The test is in `fixes0074.test.tsx`\nat line 509.\n\n"
        "The rise (`Board.tsx` `stackCaption`, `:904`); `MagicStack` ~587.\n\n"
        "The pile in `layout.ts`; it is drawn for its oldest member (~2301).\n"
    )
    ok = True
    g = problems_in(good)
    if g:
        print("SELF-TEST FAIL: good text flagged:", g)
        ok = False
    b = problems_in(bad)
    want = {1, 3, 5, 7, 9, 12, 14}
    if {n for n, _ in b} != want or len(b) < 9:
        print("SELF-TEST FAIL: bad text not fully flagged:", b)
        ok = False
    print("self-test OK" if ok else "self-test FAILED")
    return 0 if ok else 1


def main():
    if "--self-test" in sys.argv[1:]:
        return self_test()
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    total = 0
    for name in live_docs(root):
        with open(os.path.join(root, name), encoding="utf-8") as f:
            text = f.read()
        for number, hit in problems_in(text):
            total += 1
            print(f"{name}:{number}: names code by line number: {hit}")
    if total:
        print(f"\n{total} line-number reference(s) in live docs. Name the code by file and symbol "
              "(function, class, selector, constant, test) instead -- EVID-006. A line number may stay "
              "only in dated or commit-pinned evidence: put the commit sha in the same sentence, or "
              "mark it <!-- pinned -->.")
        return 1
    print("doc refs OK: no line-number references in live docs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
