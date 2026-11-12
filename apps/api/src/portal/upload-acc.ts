// @yuika/api, assembler upload lampiran chat via relay (D89 / proto v1.3).
// Relay membatasi frame 256KB → remote mengirim file sebagai FRAGMEN string
// base64 (split di sisi remote di kelipatan 4 karakter). Host menyusun
// ulang: gabungkan fragmen ber-urut → decode SEKALI di akhir.
// Di-chunk sebagai modul terpisah agar bisa dites tanpa WS/relay.

/** Batas bytes file final (sama dengan HTTP upload). */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** Batas kasar total karakter base64 yang ditampung (≈ 10MB × 4/3 + margin). */
const MAX_B64_CHARS = Math.ceil((UPLOAD_MAX_BYTES * 4) / 3) + 1024;
/** Entri tak selesai lebih lama dari ini dibuang (sweep tiap add). */
const STALE_MS = 10 * 60 * 1000;

export class UploadRejectedError extends Error {}

interface Pending {
  name: string;
  parts: Map<number, string>;
  partsTotal: number;
  chars: number;
  touchedAt: number;
}

export type AssembleResult = { done: false } | { done: true; dataB64: string };

/**
 * Akumulator multi-upload per perangkat remote. Key = deviceId, di dalamnya
 * satu entri aktif per (sessionId, name). Fragmen dijamin urut oleh outbox
 * WS, tapi kode ini tahan terhadap fragmen terduplikasi/retry (idempoten
 * per index) — tidak tahan fragmen HILANG (remote akan timeout & ulang
 * upload penuh dengan nama sama; entri lama tertimpa bagian per bagian,
 * `partsTotal` berubah menandai upload baru).
 */
export class UploadAssembler {
  private byDevice = new Map<string, Map<string, Pending>>();

  add(deviceId: string, sessionId: string, name: string, part: number, parts: number, chunk: string): AssembleResult {
    if (part < 0 || parts < 1 || part >= parts) throw new UploadRejectedError("malformed part index");
    if (parts > 5_000) throw new UploadRejectedError("too many parts");
    if (chunk.length % 4 !== 0) throw new UploadRejectedError("chunk must be base64-aligned (length % 4)");
    if (!/^[-A-Za-z0-9+/]*={0,2}$/.test(chunk)) throw new UploadRejectedError("chunk is not base64");

    let m = this.byDevice.get(deviceId);
    if (!m) {
      m = new Map();
      this.byDevice.set(deviceId, m);
    }
    this.sweep(m);

    const key = `${sessionId}\u0000${name}`;
    let p = m.get(key);
    if (!p || p.partsTotal !== parts || p.name !== name) {
      p = { name, parts: new Map(), partsTotal: parts, chars: 0, touchedAt: Date.now() };
      m.set(key, p);
    }
    p.touchedAt = Date.now();

    const prev = p.parts.get(part);
    if (prev === undefined) {
      p.chars += chunk.length;
      if (p.chars > MAX_B64_CHARS) {
        m.delete(key);
        throw new UploadRejectedError("upload exceeds 10 MB");
      }
      p.parts.set(part, chunk);
    } else if (prev !== chunk) {
      // retry dengan isi beda pada index sama → mulai ulang upload ini
      m.delete(key);
      throw new UploadRejectedError("conflicting chunk, restart upload");
    }

    if (p.parts.size < p.partsTotal) return { done: false };
    let dataB64 = "";
    for (let i = 0; i < p.partsTotal; i++) {
      const c = p.parts.get(i);
      if (c === undefined) return { done: false }; // masih ada lubang
      dataB64 += c;
    }
    m.delete(key);
    return { done: true, dataB64 };
  }

  /** Buang entri basi (dipanggil murah tiap add). */
  private sweep(m: Map<string, Pending>): void {
    const now = Date.now();
    for (const [k, p] of m) if (now - p.touchedAt > STALE_MS) m.delete(k);
  }

  /** Jumlah entri tertahan (diagnostics/test). */
  size(): number {
    let n = 0;
    for (const m of this.byDevice.values()) n += m.size;
    return n;
  }
}
