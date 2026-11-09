// Regenerasi seluruh aset logo (favicon set + ICO + portal logo) dari satu
// sumber: docs/assets/logo-white.png (500x500, latar #1a1a1a baked).
// Dipakai lintas produk (studio web, portal, desktop via tauri icon, mobile).
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const SRC = path.join(root, "docs", "assets", "logo-white.png");

async function pngTo(dst, size) {
  await sharp(SRC)
    .resize(size, size, { fit: "cover", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(dst);
  console.log("png", size, "->", path.relative(root, dst));
}

// ICO modern: entri PNG (didukung Vista+/semua browser). Header ICONDIR +
// ICONDIRENTRY per ukuran, blob PNG menyusul.
async function icoTo(dst, sizes) {
  const blobs = await Promise.all(
    sizes.map((s) => sharp(SRC).resize(s, s, { fit: "cover", kernel: "lanczos3" }).png({ compressionLevel: 9 }).toBuffer()),
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0);
    e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(blobs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += blobs[i].length;
    return e;
  });
  fs.writeFileSync(dst, Buffer.concat([header, ...entries, ...blobs]));
  console.log("ico", sizes.join("/"), "->", path.relative(root, dst));
}

const webPub = path.join(root, "apps", "web", "public");
const webApp = path.join(root, "apps", "web", "src", "app");

(async () => {
  // Sumber 1024 untuk tauri icon (desktop) — di-generate juga agar reproducible.
  await sharp(SRC)
    .resize(1024, 1024, { fit: "cover", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(root, ".tmp-logo-1024.png"));
  console.log("png 1024 -> .tmp-logo-1024.png (sumber tauri icon)");

  // Studio web.
  await pngTo(path.join(webPub, "favicon-16x16.png"), 16);
  await pngTo(path.join(webPub, "favicon-32x32.png"), 32);
  await pngTo(path.join(webPub, "apple-touch-icon.png"), 180);
  await pngTo(path.join(webPub, "android-chrome-192x192.png"), 192);
  await pngTo(path.join(webPub, "android-chrome-512x512.png"), 512);
  await icoTo(path.join(webPub, "favicon.ico"), [16, 32, 48]);
  fs.copyFileSync(path.join(webPub, "favicon.ico"), path.join(webApp, "favicon.ico"));
  fs.copyFileSync(path.join(webPub, "apple-touch-icon.png"), path.join(webApp, "apple-icon.png"));
  console.log("studio web favicon.ico + apple-icon.png (Next convention)");

  // Portal (jalankan dengan YUIKA_PORTAL_DIR=bisa absolut ke repo portal).
  const portal = process.env.YUIKA_PORTAL_DIR
    ? path.resolve(process.env.YUIKA_PORTAL_DIR)
    : path.join(root, "..", "yuika-portal");
  if (fs.existsSync(path.join(portal, "apps", "web"))) {
    const pApp = path.join(portal, "apps", "web", "src", "app");
    const pPub = path.join(portal, "apps", "web", "public");
    fs.copyFileSync(path.join(webPub, "favicon.ico"), path.join(pApp, "favicon.ico"));
    fs.copyFileSync(path.join(webPub, "apple-touch-icon.png"), path.join(pApp, "apple-icon.png"));
    await pngTo(path.join(pPub, "logo.png"), 512);
    console.log("portal favicon.ico + apple-icon.png + logo.png");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
