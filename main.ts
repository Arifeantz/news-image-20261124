// news-image-20261124 — "The World in One Day", Tuesday 24 November 2026.
//
// A Node 22 program (standard library only, no network) that writes the
// entry image to /output/entry.png (or $MAKEFUN_OUTPUT_DIR/entry.png when
// run locally). The image is a 1024x1024 newspaper front page summing up
// the world news of Tuesday 24 November 2026: 35 real stories across 7
// regions, led by Nvidia reinstating Jensen Huang as chief executive
// after Donald Trump's intervention.
//
// The image is a PNG, kept under the competition's required name
// entry.png. This program copies the repository's entry.png to the
// output directory unchanged, so the two runs the grader makes write
// byte-identical output.
//
// Run locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 1048576; // 1 MiB, the competition's size cap
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// The IEND chunk that must close every PNG: zero length, the type
// "IEND", and the CRC of those four type bytes (0xAE426082).
const IEND_TAIL = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

const here = import.meta.dirname;
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const src = join(here, 'entry.png');
const dest = join(outDir, 'entry.png');

// Read the shipped image and check it before writing it out: it must
// fit the 1 MiB cap, start with the PNG magic bytes, and end with a
// whole IEND chunk.
const original = readFileSync(src);
if (original.length > MAX_BYTES) {
  throw new Error(
    `entry.png is ${original.length} bytes, over the 1 MiB cap of ${MAX_BYTES}`,
  );
}
const magic = [...original.subarray(0, 8)];
if (magic.some((byte, i) => byte !== PNG_MAGIC[i])) {
  throw new Error('entry.png does not start with the PNG magic bytes');
}
const tail = [...original.subarray(original.length - IEND_TAIL.length)];
if (tail.some((byte, i) => byte !== IEND_TAIL[i])) {
  throw new Error('entry.png does not end with a whole IEND chunk');
}

// The first chunk must be IHDR, 13 bytes long: only then can the
// dimensions below be trusted. A file too short to hold magic bytes,
// one IHDR chunk and the IEND chunk cannot be a whole PNG.
if (original.length < 8 + 25 + IEND_TAIL.length) {
  throw new Error('entry.png is too short to be a whole PNG');
}
if (original.readUInt32BE(8) !== 13
  || original.subarray(12, 16).toString('latin1') !== 'IHDR') {
  throw new Error('entry.png does not start with a 13-byte IHDR chunk');
}

// The rules also cap the image at 1024 by 1024 pixels. The IHDR chunk
// comes first and carries the width and height as big-endian uint32s.
const width = original.readUInt32BE(16);
const height = original.readUInt32BE(20);
if (width > 1024 || height > 1024) {
  throw new Error(`entry.png is ${width}x${height}, over the 1024x1024 cap`);
}

// A PNG is whole only when every chunk's length and checksum agree, so
// walk the chunk list from the magic bytes to the IEND chunk, checking
// each chunk's CRC against the CRC-32 of its type plus data.
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}
function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
let offset = 8; // past the magic bytes
let sawIEND = false;
while (offset + 12 <= original.length) {
  const length = original.readUInt32BE(offset);
  const type = original.subarray(offset + 4, offset + 8).toString('latin1');
  const dataEnd = offset + 8 + length;
  if (dataEnd + 4 > original.length) {
    throw new Error(`entry.png chunk ${type} runs past the end of the file`);
  }
  const storedCrc = original.readUInt32BE(dataEnd);
  const actualCrc = crc32(original.subarray(offset + 4, dataEnd));
  if (storedCrc !== actualCrc) {
    throw new Error(`entry.png chunk ${type} has a bad CRC`);
  }
  offset = dataEnd + 4;
  if (type === 'IEND') {
    sawIEND = true;
    break;
  }
}
if (!sawIEND || offset !== original.length) {
  throw new Error('entry.png has trailing bytes after its IEND chunk');
}

mkdirSync(outDir, { recursive: true });
copyFileSync(src, dest);

// Determinism guard: the grader runs this program twice and both runs
// must produce the same bytes. Re-read the copy and compare it with the
// repository file byte for byte, and confirm its size on disk matches.
const written = readFileSync(dest);
if (written.length !== original.length || !written.equals(original)) {
  throw new Error('written entry.png differs from the repository copy');
}
if (statSync(dest).size !== original.length) {
  throw new Error('written entry.png has an unexpected size on disk');
}

console.log(`wrote ${dest} (${written.length} bytes)`);
