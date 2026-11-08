// @yuika/api, P1-PRT-3: portal device store (kredential device HOST).
// Gaya auth.db: SQLite terpisah dari sesi; private key TIDAK pernah keluar
// dari proses host (browser tidak menyimpan kunci host, keputusan D23).
// DB path: env YUI_PORTAL_DEVICE_DB || <repo>/portal-device.db (gitignore *.db).
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveRepoRoot } from "@yuika/core";

export interface HostDeviceRecord {
  deviceId: string;
  accountId: string;
  kind: "desktop" | "mobile" | "web";
  name: string;
  signPriv: string;
  signPub: string;
  dhPriv: string;
  dhPub: string;
  portalUrl: string;
  relayUrl: string;
  linkedAt: number;
}

let db: Database.Database | null = null;

function open(): Database.Database {
  db ??= (() => {
    const file = process.env.YUI_PORTAL_DEVICE_DB || path.join(resolveRepoRoot(), "portal-device.db");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const d = new Database(file);
    d.pragma("journal_mode = WAL");
    d.exec(`
      CREATE TABLE IF NOT EXISTS host_device (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        device_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        sign_priv TEXT NOT NULL,
        sign_pub TEXT NOT NULL,
        dh_priv TEXT NOT NULL,
        dh_pub TEXT NOT NULL,
        portal_url TEXT NOT NULL,
        relay_url TEXT NOT NULL,
        linked_at INTEGER NOT NULL
      );
    `);
    return d;
  })();
  return db;
}

const ROW = "device_id, account_id, kind, name, sign_priv, sign_pub, dh_priv, dh_pub, portal_url, relay_url, linked_at";
type Row = {
  device_id: string; account_id: string; kind: string; name: string;
  sign_priv: string; sign_pub: string; dh_priv: string; dh_pub: string;
  portal_url: string; relay_url: string; linked_at: number;
};

function toRecord(r: Row): HostDeviceRecord {
  return {
    deviceId: r.device_id, accountId: r.account_id,
    kind: (r.kind as HostDeviceRecord["kind"]) ?? "desktop",
    name: r.name,
    signPriv: r.sign_priv, signPub: r.sign_pub, dhPriv: r.dh_priv, dhPub: r.dh_pub,
    portalUrl: r.portal_url, relayUrl: r.relay_url, linkedAt: r.linked_at,
  };
}

/** Device host yang ter-link (maksimal SATU per instalasi, v0). */
export function getHostDevice(): HostDeviceRecord | null {
  const r = open().prepare(`SELECT ${ROW} FROM host_device WHERE id = 1`).get() as Row | undefined;
  return r ? toRecord(r) : null;
}

export function saveHostDevice(rec: HostDeviceRecord): void {
  open().prepare(
    `INSERT INTO host_device (id, ${ROW}) VALUES (1, @device_id, @account_id, @kind, @name, @sign_priv, @sign_pub, @dh_priv, @dh_pub, @portal_url, @relay_url, @linked_at)
     ON CONFLICT(id) DO UPDATE SET device_id=@device_id, account_id=@account_id, kind=@kind, name=@name,
       sign_priv=@sign_priv, sign_pub=@sign_pub, dh_priv=@dh_priv, dh_pub=@dh_pub,
       portal_url=@portal_url, relay_url=@relay_url, linked_at=@linked_at`,
  ).run({
    device_id: rec.deviceId, account_id: rec.accountId, kind: rec.kind, name: rec.name,
    sign_priv: rec.signPriv, sign_pub: rec.signPub, dh_priv: rec.dhPriv, dh_pub: rec.dhPub,
    portal_url: rec.portalUrl, relay_url: rec.relayUrl, linked_at: rec.linkedAt,
  } as Record<string, unknown>);
}

/** Lepas link LOKAL (perangkat masih terdaftar di portal, unlink di sana terpisah). */
export function clearHostDevice(): void {
  open().prepare("DELETE FROM host_device WHERE id = 1").run();
}

// ── CP-4: auto-link browser (device WEB hasil SSO) ─────────────────────
// Terpisah dari host manual (Settings pairing): satu instalasi bisa punya
// keduanya, host (desktop) utk remote-control, web (auto SSO) utk presence.
function ensureWebTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS web_device (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      device_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      sign_priv TEXT NOT NULL,
      sign_pub TEXT NOT NULL,
      dh_priv TEXT NOT NULL,
      dh_pub TEXT NOT NULL,
      portal_url TEXT NOT NULL,
      relay_url TEXT NOT NULL,
      linked_at INTEGER NOT NULL
    );
  `);
}

/** Device web hasil auto-link SSO (maks SATU per instalasi, v0). */
export function getWebDevice(): HostDeviceRecord | null {
  const d = open();
  ensureWebTable(d);
  const r = d.prepare(`SELECT ${ROW} FROM web_device WHERE id = 1`).get() as Row | undefined;
  return r ? toRecord(r) : null;
}

export function saveWebDevice(rec: HostDeviceRecord): void {
  const d = open();
  ensureWebTable(d);
  d.prepare(
    `INSERT INTO web_device (id, ${ROW}) VALUES (1, @device_id, @account_id, @kind, @name, @sign_priv, @sign_pub, @dh_priv, @dh_pub, @portal_url, @relay_url, @linked_at)
     ON CONFLICT(id) DO UPDATE SET device_id=@device_id, account_id=@account_id, kind=@kind, name=@name,
       sign_priv=@sign_priv, sign_pub=@sign_pub, dh_priv=@dh_priv, dh_pub=@dh_pub,
       portal_url=@portal_url, relay_url=@relay_url, linked_at=@linked_at`,
  ).run({
    device_id: rec.deviceId, account_id: rec.accountId, kind: rec.kind, name: rec.name,
    sign_priv: rec.signPriv, sign_pub: rec.signPub, dh_priv: rec.dhPriv, dh_pub: rec.dhPub,
    portal_url: rec.portalUrl, relay_url: rec.relayUrl, linked_at: rec.linkedAt,
  } as Record<string, unknown>);
}

export function clearWebDevice(): void {
  const d = open();
  ensureWebTable(d);
  d.prepare("DELETE FROM web_device WHERE id = 1").run();
}

/** Test helper: tutup + reset singleton. */
export function _resetPortalStoreForTests(): void {
  db?.close();
  db = null;
}
