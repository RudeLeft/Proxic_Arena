// PHASE_05 §5.229 acceptance pass, driven against a running stack.
//
//   node scripts/phase5-acceptance.mjs [baseUrl]
//
// The tests that are about the SERVER's answers, run against the
// real HTTP and WebSocket surface rather than against the code. The
// ones that are about a PERSON using the page are in the Playwright
// suite and are cited from the acceptance document instead of being
// badly re-done here.
//
// No dependencies: node's fetch and WebSocket, both built in on
// node 22+. Credentials come from the environment so nothing in the
// repository carries one.

const BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const USER_A = process.env.PROXIC_E2E_USER ?? "RudeLeft";
const PASS_A = process.env.PROXIC_E2E_PASSWORD ?? "a perfectly fine local passphrase";
const USER_B = process.env.PROXIC_E2E_USER_2 ?? "Pat";
const PASS_B = process.env.PROXIC_E2E_PASSWORD_2 ?? "a perfectly ordinary player password";

const results = [];
let failures = 0;

function record(id, name, passed, detail) {
  results.push({ id, name, passed, detail });
  if (!passed) failures++;
  const mark = passed ? "PASS" : "FAIL";
  console.log(`${mark}  ${id}  ${name}${detail ? `  — ${detail}` : ""}`);
}

function check(id, name, condition, detail) {
  record(id, name, Boolean(condition), detail);
}

// --- a signed-in client -----------------------------------------------------

async function signIn(username, password) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error(`login failed for ${username}: ${response.status}`);

  const jar = new Map();
  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrf = jar.get("proxicarena_csrf");

  const call = async (method, path, body) => {
    const init = { method, headers: { cookie, "X-CSRF-Token": csrf } };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}${path}`, init);
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* not json; status is what matters */
    }
    return { status: res.status, body: json, text };
  };

  const me = await call("GET", "/api/auth/me");
  return { username, cookie, csrf, call, userId: me.body.user.userId };
}

/** A lobby socket that collects frames. */
function openSocket(client) {
  const ws = new WebSocket(`${BASE.replace("http", "ws")}/ws/user`, {
    headers: { cookie: client.cookie },
  });
  const frames = [];
  ws.addEventListener("message", (event) => {
    try {
      frames.push(JSON.parse(String(event.data)));
    } catch {
      /* ignore */
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  return {
    frames,
    ready,
    send: (message) => ws.send(JSON.stringify(message)),
    close: () => ws.close(),
    /** Wait for a frame of [type], or give up. */
    await: async (type, ms = 5000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const found = frames.find((f) => f.type === type);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    },
  };
}

async function leaveAnyRoom(client) {
  const current = await client.call("GET", "/api/rooms/current");
  if (current.body.room) {
    await client.call("POST", `/api/rooms/${current.body.room.roomId}/leave`);
  }
}

async function clearDecks(client) {
  const library = await client.call("GET", "/api/decks");
  for (const deck of library.body.mine ?? []) {
    await client.call("DELETE", `/api/decks/${deck.deckId}`);
  }
}

// --- the pass ---------------------------------------------------------------

async function main() {
  const a = await signIn(USER_A, PASS_A);
  const b = await signIn(USER_B, PASS_B);
  await leaveAnyRoom(a);
  await leaveAnyRoom(b);

  // P5-A — authenticated room creation
  const created = await a.call("POST", "/api/rooms");
  const room = created.body.room;
  check(
    "P5-A",
    "Authenticated room creation",
    created.status === 201 &&
      room?.roomId &&
      room.hostUserId === a.userId &&
      room.members.length === 1 &&
      room.members[0].seatNumber === 1,
    `201, host seated in seat ${room?.members?.[0]?.seatNumber}`,
  );
  check(
    "P5-A2",
    "No join code exists (AMENDMENT 1)",
    !("joinCode" in (room ?? {})) && !created.text.includes("joinCode"),
    "the snapshot carries no code field",
  );

  // P5-C — anonymous rejection
  const anonCreate = await fetch(`${BASE}/api/rooms`, { method: "POST" });
  const anonRead = await fetch(`${BASE}/api/rooms/${room.roomId}`);
  check(
    "P5-C",
    "Anonymous rejection",
    anonCreate.status === 401 && anonRead.status === 401,
    `create ${anonCreate.status}, read ${anonRead.status}`,
  );

  // P5-D — one active room per user
  const second = await a.call("POST", "/api/rooms");
  check(
    "P5-D",
    "One active room per user",
    second.status === 409 && second.body.errorCode === "ALREADY_IN_A_ROOM",
    `${second.status} ${second.body.errorCode}`,
  );

  // P5-R — a non-member cannot read the room, and cannot reach it
  // over the socket either. There IS no per-room socket (§5.215),
  // so the attack surface is the room id, which is what this uses.
  const outsiderRead = await b.call("GET", `/api/rooms/${room.roomId}`);
  const socketB = openSocket(b);
  await socketB.ready;
  socketB.send({ type: "INVITE_ACCEPT", roomId: room.roomId });
  const refused = await socketB.await("ERROR");
  const roomLeak = await socketB.await("ROOM", 1500);
  check(
    "P5-R",
    "Protected room access",
    outsiderRead.status === 404 && refused?.errorCode === "ROOM_NOT_FOUND" && roomLeak === null,
    `read 404, uninvited accept ${refused?.errorCode}, no ROOM leaked`,
  );

  // P5-B — joining is by INVITATION now (AMENDMENT 1 replaced the
  // code). One member, one unique seat.
  const socketA = openSocket(a);
  await socketA.ready;
  await socketA.await("PRESENCE");
  socketA.send({ type: "INVITE", userId: b.userId });
  const invited = await socketB.await("INVITED");
  socketB.send({ type: "INVITE_ACCEPT", roomId: invited?.roomId });
  const joined = await socketB.await("ROOM");
  check(
    "P5-B",
    "Join by invitation",
    joined?.room?.members?.length === 2 &&
      new Set(joined.room.members.map((m) => m.seatNumber)).size === 2,
    `${joined?.room?.members?.length} members, seats ${joined?.room?.members
      ?.map((m) => m.seatNumber)
      .join("/")}`,
  );

  // P5-E — the same user in two contexts is one membership
  const bAgain = await signIn(USER_B, PASS_B);
  const seen = await bAgain.call("GET", "/api/rooms/current");
  check(
    "P5-E",
    "Duplicate session identity",
    seen.body.room?.members?.length === 2 &&
      seen.body.room.members.filter((m) => m.userId === b.userId).length === 1,
    "a second session is the same member",
  );

  // P5-M — deck privacy. B's own view names their deck; A's does not.
  const deckId = await borrowDeck(a, b);
  if (deckId) {
    const chose = await b.call("PUT", `/api/rooms/${room.roomId}/my-deck`, { deckId });
    const bView = await b.call("GET", `/api/rooms/${room.roomId}`);
    const aView = await a.call("GET", `/api/rooms/${room.roomId}`);
    const bSeat = bView.body.room.members.find((m) => m.userId === b.userId);
    const aSeat = aView.body.room.members.find((m) => m.userId === b.userId);
    check(
      "P5-M",
      "Deck privacy (personalized snapshot)",
      chose.status === 200 &&
        bSeat.selectedDeckId === deckId &&
        aSeat.deckSelected === true &&
        aSeat.selectedDeckId == null &&
        aSeat.selectedDeckName == null &&
        !aView.text.includes(deckId),
      "owner sees id+name, opponent sees only deckSelected",
    );

    // P5-K — a SHARED deck is selectable (that is what B has).
    check("P5-K", "Shared deck selection", chose.status === 200, "accepted");

    // P5-N — revoking the share clears the selection and readiness
    await b.call("PUT", `/api/rooms/${room.roomId}/ready`, { ready: true });
    const beforeRevoke = await b.call("GET", `/api/rooms/${room.roomId}`);
    const wasReady = beforeRevoke.body.room.members.find((m) => m.userId === b.userId).ready;
    await a.call("DELETE", `/api/decks/${deckId}/shares/${b.userId}`);
    const afterRevoke = await b.call("GET", `/api/rooms/${room.roomId}`);
    const nowSeat = afterRevoke.body.room.members.find((m) => m.userId === b.userId);
    check(
      "P5-N",
      "Share revocation invalidation",
      wasReady && nowSeat.deckSelected === false && nowSeat.ready === false,
      "selection and readiness both cleared",
    );
  } else {
    record("P5-M", "Deck privacy", false, "no deck available to test with");
    record("P5-K", "Shared deck selection", false, "no deck available");
    record("P5-N", "Share revocation invalidation", false, "no deck available");
  }

  // P5-L — a deck id you do not hold is not a key
  const bogus = await b.call("PUT", `/api/rooms/${room.roomId}/my-deck`, {
    deckId: "11111111-2222-3333-4444-555555555555",
  });
  check(
    "P5-L",
    "Unauthorized deck rejection",
    bogus.status === 422 && bogus.body.errorCode === "DECK_NOT_USABLE",
    `${bogus.status} ${bogus.body.errorCode}`,
  );

  // P5-O — ready needs a deck, and you can only ready yourself
  const readyNoDeck = await b.call("PUT", `/api/rooms/${room.roomId}/ready`, { ready: true });
  const spoofed = await b.call("PUT", `/api/rooms/${room.roomId}/ready`, {
    ready: true,
    userId: a.userId,
  });
  const afterSpoof = await a.call("GET", `/api/rooms/${room.roomId}`);
  check(
    "P5-O",
    "Ready-state integrity",
    readyNoDeck.status === 422 &&
      readyNoDeck.body.errorCode === "DECK_REQUIRED" &&
      !afterSpoof.body.room.members.find((m) => m.userId === a.userId).ready,
    `ready without a deck ${readyNoDeck.status}; a body naming another user changed nothing`,
  );

  // P5-S — identity spoofing, the same shape on the socket
  socketB.frames.length = 0;
  socketB.send({ type: "INVITE", userId: a.userId, fromUserId: a.userId });
  const spoofRefusal = await socketB.await("ERROR");
  // The status of B's own request is beside the point and was
  // asserted as 200 at first, which failed for an unrelated and
  // correct reason: B has no deck, so readying is refused on its
  // own merits. What P5-S is about is the OTHER user — a body
  // naming A must not move A, whatever happens to B's request.
  check(
    "P5-S",
    "Identity spoof protection",
    !afterSpoof.body.room.members.find((m) => m.userId === a.userId).ready &&
      spoofRefusal?.errorCode === "ROOM_HOST_REQUIRED",
    `A untouched (B's own request: ${spoofed.status}); socket acted as B, not the claimed user`,
  );

  // P5-G — host authority
  const nonHostClose = await b.call("POST", `/api/rooms/${room.roomId}/close`);
  const nonHostCount = await b.call("PUT", `/api/rooms/${room.roomId}/player-count`, {
    playerCount: 2,
  });
  const nonHostRemove = await b.call("DELETE", `/api/rooms/${room.roomId}/members/${a.userId}`);
  const nonHostPrepare = await b.call("POST", `/api/rooms/${room.roomId}/prepare-match`);
  check(
    "P5-G",
    "Host authorization",
    [nonHostClose, nonHostCount, nonHostRemove, nonHostPrepare].every((r) => r.status === 403),
    "close/player-count/remove/prepare all 403 for a member",
  );

  // P5-H and P5-I — presets
  const presets = await a.call("GET", "/api/match-presets");
  const ids = (presets.body.presets ?? []).map((p) => p.presetId);
  check(
    "P5-H",
    "Supported preset enforcement",
    ids.length === 1 && ids[0] === "OPEN_FORMAT_1V1",
    `catalog = [${ids.join(", ")}]; no endpoint accepts a preset id at all`,
  );
  const twoHeaded = await a.call("PUT", `/api/rooms/${room.roomId}/player-count`, {
    playerCount: 4,
  });
  check(
    "P5-I",
    "2HG safety",
    !ids.some((id) => /2HG|TWO_HEADED/i.test(id)) && twoHeaded.status === 422,
    `not in the catalog; a 4-player request is ${twoHeaded.status}`,
  );

  // P5-V — prepare preconditions, and §5.101's split
  const prepare = await a.call("POST", `/api/rooms/${room.roomId}/prepare-match`);
  const seatKeys = new Set((prepare.body.seats ?? []).flatMap((s) => Object.keys(s)));
  check(
    "P5-V",
    "Prepare preconditions",
    prepare.status === 409 &&
      prepare.body.errorCode === "SETUP_NOT_READY" &&
      prepare.body.seats.length === 2 &&
      [...seatKeys].sort().join(",") === "needsAttention,userId",
    "409 with who, never why",
  );

  // P5-17 — stale revision
  const current = await a.call("GET", `/api/rooms/${room.roomId}`);
  const stale = await a.call("PUT", `/api/rooms/${room.roomId}/player-count`, {
    playerCount: 2,
    expectedRoomRevision: current.body.room.revision - 1,
  });
  check(
    "P5-T2",
    "Stale revision rejection (§5.217)",
    stale.status === 409 && stale.body.errorCode === "ROOM_REVISION_STALE",
    `${stale.status} ${stale.body.errorCode}`,
  );

  // P5-P — disconnect does not delete membership
  socketB.close();
  await new Promise((r) => setTimeout(r, 500));
  const afterDrop = await a.call("GET", `/api/rooms/${room.roomId}`);
  check(
    "P5-P",
    "Disconnect / reconnect",
    afterDrop.body.room.members.length === 2,
    "the membership survived the socket closing",
  );

  socketA.close();
  await leaveAnyRoom(a);
  await leaveAnyRoom(b);
  await clearDecks(a);

  console.log(`\n${results.length - failures}/${results.length} passed`);
  if (failures > 0) process.exitCode = 1;
}

/**
 * A deck owned by [owner] and shared with [recipient].
 *
 * Returns null when the stack has no importable deck, which makes
 * the deck-dependent checks report honestly rather than silently
 * passing.
 */
async function borrowDeck(owner, recipient) {
  let library = await owner.call("GET", "/api/decks");
  if ((library.body.mine ?? []).length === 0) {
    // Import one, so the deck checks run instead of reporting
    // "no deck available" and looking like a pass that was skipped.
    const imported = await importAnyPackage(owner);
    if (!imported) return null;
    library = await owner.call("GET", "/api/decks");
  }
  const deck = (library.body.mine ?? [])[0];
  if (!deck) return null;
  await owner.call("POST", `/api/decks/${deck.deckId}/shares`, { username: recipient.username });
  return deck.deckId;
}

/** The real export when there is one, else the CI fixture. */
async function importAnyPackage(client) {
  const { readFileSync, existsSync, readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = join(process.cwd(), "Test Deck");
  if (!existsSync(dir)) return false;
  const zip = readdirSync(dir).find((name) => name.endsWith(".zip"));
  if (!zip) return false;

  const form = new FormData();
  form.append("package", new Blob([readFileSync(join(dir, zip))]), zip);
  const response = await fetch(`${BASE}/api/decks/import`, {
    method: "POST",
    headers: { cookie: client.cookie, "X-CSRF-Token": client.csrf },
    body: form,
  });
  return response.ok;
}

await main();
