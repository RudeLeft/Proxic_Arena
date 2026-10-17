// Build a zip from files on disk, anywhere.
//
//   node scripts/make-zip.mjs <out.zip> <file> [file...]
//
// Members are stored under their basename, which is what a deck
// package wants: a decklist at the root, not a path.
//
// This exists because a test built its fixture with
// `powershell -Command "Compress-Archive ..."`, which worked on the
// machine it was written on and failed the moment CI ran it on
// Linux. Shelling out to the platform for a zip is a dependency on
// the platform.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname } from "node:path";

const [out, ...files] = process.argv.slice(2);

if (!out || files.length === 0) {
  console.error("usage: node scripts/make-zip.mjs <out.zip> <file> [file...]");
  process.exit(2);
}

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

const u16 = (v) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v);
  return b;
};

const u32 = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
};

const locals = [];
const central = [];
let offset = 0;

for (const file of files) {
  const data = readFileSync(file);
  const nameBytes = Buffer.from(basename(file), "utf8");
  const crc = crc32(data);

  const local = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0x0800),
    u16(0), // stored
    u16(0),
    u16(0),
    u32(crc),
    u32(data.length),
    u32(data.length),
    u16(nameBytes.length),
    u16(0),
    nameBytes,
    data,
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
      u32(data.length),
      u32(data.length),
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
