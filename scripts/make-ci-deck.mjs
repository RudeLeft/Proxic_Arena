// Build a deck package from a tracked fixture.
//
//   node scripts/make-ci-deck.mjs [outputPath] [fixtureDir] [face...] [--crops]
//
// Any further arguments are face names to draw a picture for besides the
// decklist's -- the back of a card that turns over, as Deck Builder
// bundles it (spec 0008's Turn over: "Insectile Aberration" beside a
// list of "Delver of Secrets").
//
// Produces a minimal, legal Deck Builder package. Defaults to the
// CI gate deck: protocol/fixtures/ci-deck/ -> frontend/build/ci-deck.zip.
//
// A second fixture exists because the gate deck is basics only, on
// purpose (see its README: every name resolves in any Forge pool).
// A deck of 65 lands can never cast anything, so it cannot reach a
// decision that only a spell asks for. protocol/fixtures/
// planeswalker-deck/ is for those.
//
// Why this exists: the real export is gitignored because it carries
// Wizards of the Coast artwork, so on CI there is no package to
// import and every import test would skip itself. A gate that skips
// the deck pipeline has tested nothing while reporting success.
//
// Written by hand rather than with a zip library, because adding a
// dependency to produce 400 bytes of STORED entries is a worse
// trade than 60 lines of the format. Entries are stored, not
// deflated: a basics decklist compresses to nothing worth the code.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, "..", "frontend", "build", "ci-deck.zip");
const fixtureDir =
  process.argv[3] ?? join(here, "..", "protocol", "fixtures", "ci-deck");

// CRC-32, because a zip entry carries one and readers check it.
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value);
  return b;
}

function u32(value) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0);
  return b;
}

/**
 * A solid-colour PNG, generated rather than shipped.
 *
 * Artwork is optional, but leaving it out means CI never exercises
 * the art pipeline -- decode, dimension check, content-addressed
 * store, display derivative, and the Phase 4 authorization that
 * guards it. That is a lot of surface to leave untested because the
 * only real images are copyrighted.
 *
 * 60x84 keeps the card aspect and clears ArtStore's 50px minimum,
 * which exists to reject thumbnails pretending to be card scans.
 */
function png(width, height, rgb) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([u32be(data.length), body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  // 10-12: compression, filter, interlace all zero.

  // One filter byte per scanline, then raw RGB triples.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const at = row + 1 + x * 3;
      raw[at] = rgb[0];
      raw[at + 1] = rgb[1];
      raw[at + 2] = rgb[2];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function u32be(value) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value >>> 0);
  return b;
}

const members = readdirSync(fixtureDir)
  // README.md is documentation for humans, and §2 of the package
  // format permits exactly one .txt at the root and nothing else.
  // Shipping the README inside the package would make it invalid.
  .filter((name) => name.endsWith(".txt"))
  .map((name) => ({ name, data: readFileSync(join(fixtureDir, name)) }));

if (members.length !== 1) {
  throw new Error(`expected exactly one .txt in ${fixtureDir}, found ${members.length}`);
}

// One image per distinct card NAME (§5), under real_cards/.
//
// READ OFF THE DECKLIST rather than listed here, so a new fixture
// needs no edit to this file and cannot be half-added -- a deck
// whose artwork list was written separately is a deck with a
// missing image, and §5 makes artwork optional in a way that
// would hide it.
//
// The set bracket is dropped because the importer matches on the
// NAME and ignores it, which is also why "[CI]" is honest here:
// these are not real card images and are not meant to pass as any
// printing.
//
// The colours exist only so a person looking at an imported deck
// sees different cards rather than identical grey rectangles.
const extra = process.argv.slice(4);
const withCrops = extra.includes("--crops");
const withPrintings = extra.includes("--printings");
const faces = extra.filter((arg) => arg !== "--crops" && arg !== "--printings");
const CROP_JPEG =
  "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";

const cardNames = [
  ...new Set(
    String(members[0].data)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//"))
      // "4 Elspeth Resplendent [SNC:12]" -> "Elspeth Resplendent"
      .map((line) => line.replace(/^\d+\s+/, "").replace(/\s*\[[^\]]*\]\s*$/, ""))
      // A two-faced card's image is filed under its FRONT face, as
      // the real exporter does ("Reckless Stormseeker [MID].png");
      // the full "A // B" would put a slash in the member path. Its
      // BACK face gets its own image under its own name, as the
      // exporter does since 2026-10-21 (PHASE_07 §7.59): "Insectile
      // Aberration [CI].png" beside "Delver of Secrets [CI].png".
      .flatMap((name) => name.split(" // ").map((face) => face.trim()))
      .filter(Boolean)
      .concat(faces),
  ),
];

const artwork = cardNames.map((name) => {
  // A colour from the name, so it is stable across runs and
  // distinct between cards without a table to maintain.
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const rgb = [60 + (hash % 150), 60 + ((hash >>> 8) % 150), 60 + ((hash >>> 16) % 150)];
  return { name: `real_cards/${name} [CI].png`, data: png(60, 84, rgb) };
});

members.push(...artwork);

// Spec 0053 -- with --printings, a picture of its own for every printing of a
// name after the deck's first, as the Deck Builder sends them:
// real_cards/<Name> [SET-NUM].png ("4 Mountain [DD1:60]" -> "Mountain
// [DD1-60].png"). The first printing keeps the name's picture above. Each
// gets a colour of its own, so a hand of several printings shows several.
if (withPrintings) {
  const seen = new Set();
  for (const line of String(members[0].data).split(/\r?\n/)) {
    const match = line.trim().match(/^\d+\s+(.+?)\s+\[([^:\]]+):([^\]]+)\]$/);
    if (!match) continue;
    const [, name, set, number] = match;
    if (!seen.has(name)) {
      seen.add(name);
      continue;
    }
    let hash = 7;
    for (const ch of `${name}|${set}|${number}`) hash = (hash * 131 + ch.codePointAt(0)) >>> 0;
    const rgb = [40 + (hash % 200), 40 + ((hash >>> 8) % 200), 40 + ((hash >>> 16) % 200)];
    members.push({ name: `real_cards/${name} [${set}-${number}].png`, data: png(60, 84, rgb) });
  }
}

// Spec 0051 -- with --crops, an art crop for every picture, as the Deck
// Builder sends them: art_crops/<Name> [CI].jpg. One small checkered JPEG
// for all of them (yellow and blue, unlike any card's solid colour), so a
// screenshot tells the crop from the zoomed picture at a glance. A JPEG
// cannot be drawn by hand as the PNGs are, so it is carried here.
if (withCrops) {
  const crop = Buffer.from(CROP_JPEG, "base64");
  members.push(...cardNames.map((name) => ({ name: `art_crops/${name} [CI].jpg`, data: crop })));
}

const locals = [];
const central = [];
let offset = 0;

for (const member of members) {
  const nameBytes = Buffer.from(member.name, "utf8");
  const crc = crc32(member.data);
  const size = member.data.length;

  const local = Buffer.concat([
    u32(0x04034b50),
    u16(20), // version needed
    u16(0x0800), // UTF-8 names
    u16(0), // stored
    u16(0),
    u16(0), // time, date
    u32(crc),
    u32(size),
    u32(size),
    u16(nameBytes.length),
    u16(0),
    nameBytes,
    member.data,
  ]);
  locals.push(local);

  central.push(
    Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]),
  );
  offset += local.length;
}

const centralBuffer = Buffer.concat(central);
const zip = Buffer.concat([
  ...locals,
  centralBuffer,
  Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(central.length),
    u16(central.length),
    u32(centralBuffer.length),
    u32(offset),
    u16(0),
  ]),
]);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zip);
console.log(`${out}  ${zip.length} bytes  ${members.length} members`);
