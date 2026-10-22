// Build a deck package from a tracked fixture.
//
//   node scripts/make-ci-deck.mjs [outputPath] [fixtureDir]
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
      .filter(Boolean),
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
