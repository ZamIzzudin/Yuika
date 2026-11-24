// @yuika/core, artifact zip: bundel artefak project jadi .zip TANPA
// dependensi baru (writer DEFLATE via zlib bawaan Node). Dipakai route
// /api/projects/:id/artifact (download artefact) - file tab + backup
// cepat. Batas aman: 2000 entri, 100 MB/entri, 256 MB total; lewati
// dir tersembunyi/node_modules (aturan sama dengan file tree, tapi
// TANPA batas kedalaman tree UI).
import { deflateRawSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", ".next", "__pycache__", ".turbo"]);
const MAX_ENTRIES = 2000;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

export interface ZipEntry {
  name: string; // path relatif dalam zip, selalu forward-slash
  data: Buffer;
}

// ── CRC32 (IEEE 802.3), tabel precomputed ────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i]!;
    c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Rangkai entri jadi buffer zip valid (method 8 DEFLATE + central dir). */
export function buildZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const comp = deflateRawSync(e.data, { level: 6 });
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10); // mod time (tidak dipakai)
    local.writeUInt16LE(0x21, 12); // mod date: 1980-01-01 (deterministik)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    chunks.push(local, nameBuf, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0x0800, 8); // UTF-8
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    // extra/comment/disk/attrs (29..41) = 0
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

/** Kumpulkan file project root → entri zip (relative, forward-slash). */
export function collectZipEntries(root: string): ZipEntry[] {
  const out: ZipEntry[] = [];
  let total = 0;
  const walk = (dir: string, rel: string) => {
    if (out.length >= MAX_ENTRIES) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable → skip, bukan error fatal
    }
    ents.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of ents) {
      if (out.length >= MAX_ENTRIES || total >= MAX_TOTAL_BYTES) return;
      if (e.name.startsWith(".")) continue;
      const abs = path.join(dir, e.name);
      const relName = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(abs, relName);
        continue;
      }
      if (!e.isFile()) continue;
      let st: fs.Stats;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      if (st.size > MAX_FILE_BYTES) continue;
      if (total + st.size > MAX_TOTAL_BYTES) return;
      total += st.size;
      out.push({ name: relName, data: fs.readFileSync(abs) });
    }
  };
  walk(root, "");
  return out;
}
