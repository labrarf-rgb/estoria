/**
 * A minimal ZIP writer, because a `.docx` is a ZIP and this project has three
 * runtime dependencies (react, react-dom, zustand) that it would rather keep.
 *
 * Entries are **stored, not deflated**. Word reads stored entries perfectly
 * well, and the alternative is either shipping a compression library or writing
 * one — for a manuscript of a few hundred kilobytes of text, neither is worth
 * it. The file is larger than it needs to be and correct, which is the right way
 * round for something a writer sends to an agent.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** MS-DOS date/time, which is what the ZIP format stores. */
function dosStamp(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function zipStore(entries: ZipEntry[], now = new Date()): Uint8Array {
  const { time, date } = dosStamp(now);
  const enc = new TextEncoder();
  const named = entries.map((e) => ({ ...e, nameBytes: enc.encode(e.name), crc: crc32(e.data) }));

  const localSize = named.reduce((n, e) => n + 30 + e.nameBytes.length + e.data.length, 0);
  const centralSize = named.reduce((n, e) => n + 46 + e.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let at = 0;
  const offsets: number[] = [];

  for (const e of named) {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true); // local file header
    view.setUint16(at + 4, 20, true); // version needed
    view.setUint16(at + 6, 0, true); // flags
    view.setUint16(at + 8, 0, true); // stored
    view.setUint16(at + 10, time, true);
    view.setUint16(at + 12, date, true);
    view.setUint32(at + 14, e.crc, true);
    view.setUint32(at + 18, e.data.length, true); // compressed size
    view.setUint32(at + 22, e.data.length, true); // uncompressed size
    view.setUint16(at + 26, e.nameBytes.length, true);
    view.setUint16(at + 28, 0, true); // extra length
    at += 30;
    out.set(e.nameBytes, at);
    at += e.nameBytes.length;
    out.set(e.data, at);
    at += e.data.length;
  }

  const centralStart = at;
  named.forEach((e, i) => {
    view.setUint32(at, 0x02014b50, true); // central directory header
    view.setUint16(at + 4, 20, true); // version made by
    view.setUint16(at + 6, 20, true); // version needed
    view.setUint16(at + 8, 0, true); // flags
    view.setUint16(at + 10, 0, true); // stored
    view.setUint16(at + 12, time, true);
    view.setUint16(at + 14, date, true);
    view.setUint32(at + 16, e.crc, true);
    view.setUint32(at + 20, e.data.length, true);
    view.setUint32(at + 24, e.data.length, true);
    view.setUint16(at + 28, e.nameBytes.length, true);
    view.setUint16(at + 30, 0, true); // extra
    view.setUint16(at + 32, 0, true); // comment
    view.setUint16(at + 34, 0, true); // disk number
    view.setUint16(at + 36, 0, true); // internal attrs
    view.setUint32(at + 38, 0, true); // external attrs
    view.setUint32(at + 42, offsets[i], true);
    at += 46;
    out.set(e.nameBytes, at);
    at += e.nameBytes.length;
  });

  view.setUint32(at, 0x06054b50, true); // end of central directory
  view.setUint16(at + 4, 0, true);
  view.setUint16(at + 6, 0, true);
  view.setUint16(at + 8, named.length, true);
  view.setUint16(at + 10, named.length, true);
  view.setUint32(at + 12, at - centralStart, true); // central directory size
  view.setUint32(at + 16, centralStart, true);
  view.setUint16(at + 20, 0, true); // comment length
  return out;
}
