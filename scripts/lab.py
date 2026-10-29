"""The shared harness for Mechanics Lab scenario checks (PHASE_06 §6.6, Layer B).

A scenario script imports this, gives each seat a focused deck, and
supplies a POLICY -- what to answer when a question is its business. The
harness drives the worker over its stdin/stdout protocol exactly as the
older check-*.py scripts do, and answers the routine questions (keep the
hand, play first, pay with the first source, confirm a payment, discard
the first card, no attacks or blocks) so a scenario only says what is
particular to its card.

    from lab import Game, DEFAULT, verdict
    game = Game(seat1=[("Island", 30), ...], seat2=[...])
    game.run(policy, until=lambda g: ..., max_turn=20)

A policy is called with (game, frame) for every DECISION_REQUEST and
returns an actionId, None (pass / decline), DEFAULT to let the
harness answer, or HOLD to leave the question unanswered (a scenario that
ends the game another way, e.g. a concession, PHASE_07 §7.55).

Run with `python -I`: the harness puts its own directory on the path, so
a scenario finds it.
"""
import json
import os
import queue
import re
import subprocess
import sys
import tempfile
import threading
import uuid

DEFAULT = object()
HOLD = object()

# A worker that says nothing for this long has stopped: the game ends with
# WORKER_SILENT instead of hanging until CI kills the whole check, and the
# worker's own log is kept beside the trace.
SILENCE_S = 120
CARD = re.compile(r"card:(\d+)")


def card_of(action_id):
    m = CARD.search(action_id or "")
    return f"card:{m.group(1)}" if m else None


class Game:
    def __init__(self, seat1, seat2, jar=None, res=None, trace=None, jvm=(), stops=None):
        self.jar = jar or sys.argv[1]
        self.res = res or sys.argv[2]
        trace = trace if trace is not None else (sys.argv[3] if len(sys.argv) > 3 else None)
        self.decks = {1: seat1, 2: seat2}
        # Spec 0035 -- {seat: True}: the seat follows the one stops rule; a
        # seat without it is asked at every step, as before.
        self.stops = stops or {}
        self.state = {}            # seat -> latest snapshot, that seat's view
        self.ended = None          # the GAME_ENDED frame
        self.error = None          # an ERROR frame that stopped the game
        self.notices = {1: [], 2: []}
        self.asked = []            # (seat, kind, prompt, labels) for every question
        self.refused = 0           # answers the worker refused (DECISION_REFUSED)
        self.turn = 0
        # The worker's own log (Forge's messages): LAB_STDERR names a file
        # for a scenario being debugged; otherwise it goes beside the trace
        # (or to a temporary file) and is kept only if the game goes silent.
        if os.environ.get("LAB_STDERR"):
            self.stderr_path = os.environ["LAB_STDERR"]
        elif trace:
            self.stderr_path = trace[: -len(".jsonl")] + ".stderr.log" if trace.endswith(".jsonl") else trace + ".stderr.log"
        else:
            self.stderr_path = tempfile.mktemp(suffix=".stderr.log")
        self.stderr_file = open(self.stderr_path, "w", encoding="utf-8")
        self.proc = subprocess.Popen(
            ["java", *jvm, "-jar", self.jar, self.res],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.stderr_file,
            text=True, encoding="utf-8", bufsize=1)
        # Lines arrive through a queue so the loop can notice silence.
        self.lines = queue.Queue()

        def pump(out, q):
            for line in out:
                q.put(line)
            q.put(None)  # end of output

        threading.Thread(target=pump, args=(self.proc.stdout, self.lines), daemon=True).start()
        # Line-buffered: a scenario killed for hanging keeps every frame it
        # saw, which is the only account of what it was waiting on.
        self.trace = open(trace, "w", encoding="utf-8", buffering=1) if trace else None

    # --- the wire ------------------------------------------------------

    def send(self, obj):
        if self.trace:
            self.trace.write(json.dumps({"dir": "out", "frame": obj}) + "\n")
        self.proc.stdin.write(json.dumps(obj) + "\n")
        self.proc.stdin.flush()

    def answer(self, frame, action_id):
        self.send({"protocolVersion": 1, "type": "DECISION_RESPONSE",
                   "messageId": str(uuid.uuid4()), "decisionId": frame["decisionId"],
                   "seat": frame["authorisedSeat"], "stateVersion": frame["stateVersion"],
                   "actionId": action_id})

    def concede(self, seat):
        """PHASE_07 §7.55 -- `seat` concedes, as the server would send it."""
        self.send({"protocolVersion": 1, "type": "CONCEDE",
                   "messageId": str(uuid.uuid4()), "seat": seat})

    # --- what a seat can see -----------------------------------------------

    def zone(self, seat, zone, owner=None, name=None):
        cards = self.state.get(seat, {}).get(zone, []) or []
        return [c for c in cards
                if (owner is None or c.get("seat") == owner) and (name is None or c.get("name") == name)]

    def mine(self, seat, zone="battlefield", name=None):
        return self.zone(seat, zone, owner=seat, name=name)

    def player(self, viewer, seat):
        return next((p for p in self.state.get(viewer, {}).get("players", []) if p.get("seat") == seat), {})

    def untapped_lands(self, seat, name=None):
        return [c for c in self.mine(seat) if c.get("kind") == "land" and not c.get("tapped")
                and (name is None or c.get("name") == name)]

    def card(self, seat, card_id):
        for zone in ("hand", "battlefield", "graveyard", "exile", "stack", "otherHands"):
            for c in self.state.get(seat, {}).get(zone, []) or []:
                if c.get("id") == card_id:
                    return c
        return None

    # --- options ---------------------------------------------------------------

    @staticmethod
    def labels(frame):
        return [o.get("label") or "" for o in frame.get("options", [])]

    def option(self, frame, name=None, contains=None, zone=None, land=None):
        """The first option whose card has this name (in `zone` of the asked
        seat, if given) and whose label contains `contains`."""
        seat = frame["authorisedSeat"]
        for o in frame.get("options", []):
            label = o.get("label") or ""
            if contains is not None and contains not in label:
                continue
            if land is not None and ("Play land" in label) != land:
                continue
            if name is not None:
                cid = card_of(o.get("actionId"))
                pool = self.zone(seat, zone) if zone else [c for z in ("hand", "battlefield", "graveyard", "exile")
                                                           for c in self.zone(seat, z)]
                if not any(c.get("id") == cid and c.get("name") == name for c in pool) \
                        and not label.startswith(name):
                    continue
            return o["actionId"]
        return None

    def play_land(self, frame, prefer=None):
        for name in ([prefer] if prefer else []) + [None]:
            o = self.option(frame, name=name, land=True)
            if o:
                return o
        return None

    # --- the routine questions -------------------------------------------------

    def default(self, frame):
        kind = frame.get("kind")
        options = frame.get("options", [])
        if kind == "chooseSpellAbilityToPlay":
            return self.play_land(frame)
        if kind in ("declareAttackers", "declareBlockers"):
            return None
        # A target question is not "mandatory" (passing cancels the
        # spell), so it must be named here: a scenario that cast
        # something wants it to go ahead.
        if kind in ("mulliganKeepHand", "chooseStartingPlayer", "applyManaToCost", "confirmPayment",
                    "chooseCardsToDiscardToMaximumHandSize", "chooseManaAbility", "chooseTargetsFor"):
            return options[0]["actionId"] if options else None
        return options[0]["actionId"] if (options and frame.get("mandatory")) else None

    # --- the loop -------------------------------------------------------------

    def _lines(self):
        while True:
            try:
                line = self.lines.get(timeout=SILENCE_S)
            except queue.Empty:
                self.error = {"errorCode": "WORKER_SILENT",
                              "detail": f"no frame for {SILENCE_S} s; worker log: {self.stderr_path}"}
                return
            if line is None:
                return
            yield line

    def run(self, policy, until=lambda g: False, max_turn=20):
        last_question = None
        retried = set()  # questions whose refused pass was answered again
        for line in self._lines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                frame = json.loads(line)
            except ValueError:
                continue
            if self.trace:
                self.trace.write(json.dumps({"dir": "in", "frame": frame}) + "\n")
            kind = frame.get("type")
            if kind == "WORKER_READY":
                def cards(deck):
                    out = []
                    for entry in deck:
                        name, qty = entry[0], entry[-1]
                        card = {"name": name, "quantity": qty}
                        if len(entry) == 4:
                            card["set"], card["number"] = entry[1], entry[2]
                        out.append(card)
                    return out
                self.send({"protocolVersion": 1, "type": "START_GAME",
                           "messageId": str(uuid.uuid4()), "matchId": str(uuid.uuid4()),
                           "players": [dict({"displayName": "Alice", "seatNumber": 1, "cards": cards(self.decks[1])},
                                            **({"stops": self.stops[1]} if 1 in self.stops else {})),
                                       dict({"displayName": "Bob", "seatNumber": 2, "cards": cards(self.decks[2])},
                                            **({"stops": self.stops[2]} if 2 in self.stops else {}))]})
                continue
            if kind == "MATCH_SNAPSHOT":
                s = frame.get("state") or {}
                self.state[s.get("seat")] = s
                self.turn = s.get("turn") or self.turn
                for text in s.get("notices", []) or []:
                    if text not in self.notices.setdefault(s.get("seat"), []):
                        self.notices[s.get("seat")].append(text)
                if until(self) or self.turn > max_turn:
                    break
                continue
            if kind == "GAME_ENDED":
                self.ended = frame
                break
            if kind == "ERROR" and frame.get("errorCode") == "DECISION_REFUSED":
                self.refused += 1
                # The worker refuses a pass where the rules leave no "no"
                # and goes on waiting; answer it properly rather than wait
                # with it (a marvel game passed on the legend rule's
                # "keep which one?" and both sides waited).
                # Once per question, with its first option: never a loop of
                # refused answers.
                if frame.get("detail") == "PASS_NOT_ALLOWED" and last_question \
                        and frame.get("decisionId") == last_question["decisionId"] \
                        and last_question["decisionId"] not in retried and last_question.get("options"):
                    retried.add(last_question["decisionId"])
                    self.answer(last_question, last_question["options"][0]["actionId"])
                continue
            if kind == "ERROR":
                self.error = frame
                break
            if kind != "DECISION_REQUEST":
                continue
            self.asked.append((frame["authorisedSeat"], frame.get("kind"), frame.get("prompt"), self.labels(frame)))
            choice = policy(self, frame)
            if choice is HOLD:
                continue
            if choice is DEFAULT or (choice is None and frame.get("mandatory")):
                # No pass on a question the rules make you answer.
                choice = self.default(frame)
            last_question = frame
            self.answer(frame, choice)
        self.proc.kill()
        try:
            self.proc.wait(timeout=10)  # Windows keeps a live process's files
        except subprocess.TimeoutExpired:
            pass
        self.stderr_file.close()
        if self.trace:
            self.trace.close()
        if not self.error and not os.environ.get("LAB_STDERR"):
            try:
                os.remove(self.stderr_path)
            except OSError:
                pass
        return self

    def stopped_badly(self):
        """Why the game stopped, when it was not the scenario that stopped it."""
        if self.error:
            return f"worker error {self.error.get('errorCode')}: {self.error.get('detail')}"
        if self.ended and self.ended.get("outcome") == "FAILED":
            return f"the match failed: {self.ended.get('detail')}"
        return None


def verdict(found, problems, ok, inconclusive=None):
    """Print the evidence and exit 0 / 1 / 2, as every check does."""
    print(json.dumps(found, indent=2, ensure_ascii=False, default=str))
    if inconclusive:
        print("INCONCLUSIVE:", inconclusive)
        sys.exit(2)
    if problems:
        print("WRONG:", "; ".join(problems))
        sys.exit(1)
    print("OK:", ok)
    sys.exit(0)
