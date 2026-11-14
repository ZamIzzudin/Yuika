"use client";
// D109: export design ke PNG per halaman, atau seluruh file jadi satu ZIP
// (tiap halaman = 1 PNG). Renderer mandiri (tanpa menyentuh DesignCanvas):
// rect/frame/circle/text/icon/image/group sesuai perilaku drawShape canvas,
// minus chrome editor (seleksi, handle, label frame). Font Google dipastikan
// termuat (fontLoader), icon + aset image di-preload sebelum menggambar.
// ZIP = store tanpa kompresi (zero-dep web, CRC32 lokal).
import type { DesignFile, DesignPage, DesignShape } from "@yuika/core/design";
import { collectFontFamilies, ensureFont } from "./fontLoader";
import { getIconImage, iconUrl, loadIcon } from "./iconAssets";
import { getAssetImage, loadAsset } from "./designAssets";

/** Bagian dari drawShape canvas yang relevan utk export: frame/group/tree. */
function hasKids(s: DesignShape): s is Extract<DesignShape, { children: string[] }> {
  return s.type === "frame" || s.type === "group";
}

function absPos(shape: DesignShape, page: DesignPage): { x: number; y: number } {
  let x = shape.x;
  let y = shape.y;
  let p = shape.parentId ? page.shapes[shape.parentId] : undefined;
  while (p) {
    x += p.x;
    y += p.y;
    p = p.parentId ? page.shapes[p.parentId] : undefined;
  }
  return { x, y };
}

/** Bounding box semua shape terlihat di halaman (world coords). */
function pageBox(page: DesignPage): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const walk = (s: DesignShape): void => {
    if (s.hidden) return;
    const p = absPos(s, page);
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + s.width);
    y1 = Math.max(y1, p.y + s.height);
    if (hasKids(s)) for (const c of s.children) {
      const ch = page.shapes[c];
      if (ch) walk(ch);
    }
  };
  for (const id of page.roots) {
    const s = page.shapes[id];
    if (s) walk(s);
  }
  if (x0 === Infinity || x1 < x0 || y1 < y0) return { x: 0, y: 0, w: 320, h: 240 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function drawIconOrPlaceholder(
  ctx: CanvasRenderingContext2D,
  shape: Extract<DesignShape, { type: "icon" }>,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
): void {
  const img = getIconImage(shape.icon, fill);
  if (img) {
    ctx.drawImage(img, x, y, w, h);
  } else if (iconUrl(shape.icon, fill)) {
    // data URL lokal: gambar sinkron dari img bank (best effort)
    ctx.strokeStyle = "#a1a1aa";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }
}

/** Preload font/icon/aset image halaman supaya PNG tidak polos. */
async function prerenderPageAssets(file: DesignFile, page: DesignPage): Promise<void> {
  await Promise.all(collectFontFamilies(file).map((f) => ensureFont(f)));
  const icons = new Set<string>();
  const assets = new Set<string>();
  const walk = (s: DesignShape): void => {
    if (s.type === "icon" && s.fills[0]?.color) icons.add(`${s.icon}|${s.fills[0].color}`);
    if (s.type === "image" && s.src) assets.add(s.src);
    if (s.type === "frame" && s.fills[0]?.image) assets.add(s.fills[0].image);
    if (hasKids(s)) for (const c of s.children) {
      const ch = page.shapes[c];
      if (ch) walk(ch);
    }
  };
  for (const id of page.roots) {
    const s = page.shapes[id];
    if (s) walk(s);
  }
  for (const key of icons) {
    const [name, color] = key.split("|");
    if (name && color) loadIcon(name, color);
  }
  for (const src of assets) loadAsset(src);
  // Poll hingga siap (maks 5 dtk) - data URL icon instan, aset fetch network.
  const t0 = Date.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      let pending = 0;
      for (const key of icons) {
        const [name, color] = key.split("|");
        if (name && color && !getIconImage(name, color)) pending++;
      }
      for (const src of assets) if (!getAssetImage(src)) pending++;
      if (pending === 0 || Date.now() - t0 > 5000) resolve();
      else setTimeout(tick, 120);
    };
    tick();
  });
}

function drawShapeExport(
  ctx: CanvasRenderingContext2D,
  shape: DesignShape,
  page: DesignPage,
): void {
  if (shape.hidden) return;
  const { x, y } = absPos(shape, page);
  const w = shape.width;
  const h = shape.height;
  ctx.save();
  ctx.globalAlpha = (shape.opacity ?? 1) * (shape.fills[0]?.opacity ?? 1);
  const fill = shape.fills[0]?.color ?? "#00000000";
  ctx.fillStyle = fill;
  if (shape.type === "circle") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (shape.stroke && shape.stroke.width > 0) {
      ctx.strokeStyle = shape.stroke.color;
      ctx.lineWidth = shape.stroke.width;
      ctx.stroke();
    }
  } else if (shape.type === "text") {
    ctx.fillStyle = shape.color;
    const fs = shape.fontSize;
    ctx.font = `${shape.fontWeight ?? 400} ${fs}px ${shape.fontFamily ? `"${shape.fontFamily}", ` : ""}ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    const lh = fs * (shape.lineHeight ?? 1.35);
    const wrapped: string[] = [];
    for (const ln of shape.text.split("\n")) {
      let cur = "";
      for (const word of ln.split(" ")) {
        const t = cur ? `${cur} ${word}` : word;
        if (ctx.measureText(t).width > w && cur) {
          wrapped.push(cur);
          cur = word;
        } else cur = t;
      }
      wrapped.push(cur);
    }
    ctx.textAlign =
      shape.align === "center" ? "center" : shape.align === "right" ? "right" : "left";
    const tx = shape.align === "center" ? x + w / 2 : shape.align === "right" ? x + w : x;
    wrapped.forEach((t, i) => ctx.fillText(t, tx, y + i * lh));
  } else if (shape.type === "icon") {
    drawIconOrPlaceholder(ctx, shape, x, y, w, h, fill);
  } else if (shape.type === "image") {
    const img = getAssetImage(shape.src);
    const r = Math.min(shape.radius ?? 0, w / 2, h / 2);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.clip();
      const fit = shape.fit ?? "cover";
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      let dw = w;
      let dh = h;
      let dx = x;
      let dy = y;
      if (fit !== "stretch") {
        const sc = fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
        dw = iw * sc;
        dh = ih * sc;
        dx = x + (w - dw) / 2;
        dy = y + (h - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = shape.fills[0]?.color ?? "#1c1c24";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    }
  } else if (shape.type !== "group") {
    // frame / rect (group = wadah logis tanpa visual)
    const r = Math.min(shape.radius ?? 0, w / 2, h / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    if (shape.type === "frame" && shape.fills[0]?.image) {
      const img = getAssetImage(shape.fills[0].image);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.clip();
        const sc = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * sc;
        const dh = img.naturalHeight * sc;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        ctx.restore();
      }
    }
    if (shape.stroke && shape.stroke.width > 0) {
      ctx.strokeStyle = shape.stroke.color;
      ctx.lineWidth = shape.stroke.width;
      ctx.stroke();
    }
  }
  ctx.restore();
  if (hasKids(shape)) {
    for (const c of shape.children) {
      const ch = page.shapes[c];
      if (ch) drawShapeExport(ctx, ch, page);
    }
  }
}

/** Render 1 halaman ke canvas offscreen pada scale 2x (retina enak dilihat). */
export async function renderPageCanvas(
  file: DesignFile,
  page: DesignPage,
  scale = 2,
): Promise<HTMLCanvasElement> {
  await prerenderPageAssets(file, page);
  const box = pageBox(page);
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(box.w * scale));
  cv.height = Math.max(1, Math.round(box.h * scale));
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
  ctx.fillStyle = page.background || "#ffffff";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  for (const id of page.roots) {
    const s = page.shapes[id];
    if (s) drawShapeExport(ctx, s, page);
  }
  return cv;
}

// ---- ZIP (store, tanpa kompresi) — zero-dep ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]!;
    c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Buat ZIP store dari daftar (nama file ASCII, data). */
function zipStore(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const d = new Date();
  const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const lh = new Uint8Array(30 + name.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); // version needed
    dv.setUint16(6, 0, true); // flags
    dv.setUint16(8, 0, true); // method: store
    dv.setUint16(10, dosTime, true);
    dv.setUint16(12, dosDate, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, e.data.length, true);
    dv.setUint32(22, e.data.length, true);
    dv.setUint16(26, name.length, true);
    dv.setUint16(28, 0, true); // extra len
    lh.set(name, 30);
    parts.push(lh, e.data);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true); // store
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // local header offset
    ch.set(name, 46);
    central.push(ch);
    offset += lh.length + e.data.length;
  }
  let cdSize = 0;
  for (const c of central) cdSize += c.length;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of [...parts, ...central, eocd]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "design"
  );
}

function download(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Export SATU halaman aktif sebagai PNG (scale 2x). */
export async function exportPagePng(file: DesignFile, page: DesignPage): Promise<string> {
  const cv = await renderPageCanvas(file, page, 2);
  const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/png"));
  if (!blob) throw new Error("failed to encode PNG");
  const name = `${slug(file.name)}-${slug(page.name)}.png`;
  download(blob, name);
  return name;
}

/** Export SEMUA halaman file sebagai ZIP berisi PNG per halaman. */
export async function exportFileZip(file: DesignFile): Promise<string> {
  const entries: { name: string; data: Uint8Array }[] = [];
  let i = 1;
  for (const page of file.pages) {
    const cv = await renderPageCanvas(file, page, 2);
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/png"));
    if (!blob) throw new Error("failed to encode PNG");
    const data = new Uint8Array(await blob.arrayBuffer());
    const base = `${String(i).padStart(2, "0")}-${slug(page.name)}`;
    let name = `${base}.png`;
    let n = 2;
    while (entries.some((e) => e.name === name)) name = `${base}-${n++}.png`;
    entries.push({ name, data });
    i++;
  }
  if (entries.length === 0) throw new Error("no pages to export");
  const zip = zipStore(entries);
  const name = `${slug(file.name)}.zip`;
  download(new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }), name);
  return name;
}
