"use client";
// D103: icon bank renderer untuk Design tab. Markup SVG (viewBox 256) dari
// apps/web/src/lib/iconBank.ts (generated, Phosphor regular, MIT). Warna
// di-inject ke root <svg fill> lalu jadi data URL — dipakai canvas
// (drawImage) dan prototype (<img>), tanpa fetch eksternal (offline OK).
import { useEffect, useReducer } from "react";
import { ICON_BANK } from "./iconBank";

interface Entry {
  status: "loading" | "ok";
  img?: HTMLImageElement;
}

const urls = new Map<string, string>(); // key name|color -> data URL
const imgs = new Map<string, Entry>(); // key name|color -> decoded image
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function hasIcon(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ICON_BANK, name);
}

/** Data URL SVG berwarna (sync, cached). Null bila nama tak ada di bank. */
export function iconUrl(name: string, color: string): string | null {
  const markup = ICON_BANK[name];
  if (!markup) return null;
  const key = `${name}|${color}`;
  let u = urls.get(key);
  if (!u) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="${color}">${markup}</svg>`;
    u = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    urls.set(key, u);
  }
  return u;
}

/** Minta image icon termuat (idempoten); onload -> notify -> repaint canvas. */
export function loadIcon(name: string, color: string): void {
  const markup = ICON_BANK[name];
  if (!markup) return;
  const key = `${name}|${color}`;
  if (imgs.has(key)) return;
  const e: Entry = { status: "loading" };
  imgs.set(key, e);
  const url = iconUrl(name, color)!;
  const img = new Image();
  img.onload = () => {
    e.status = "ok";
    e.img = img;
    notify();
  };
  img.onerror = () => {
    // data URL lokal hampir mustahil gagal; tetap tandai ok agar tidak loop
    e.status = "ok";
    e.img = img;
    notify();
  };
  img.src = url;
}

/** Image siap drawImage (null bila belum termuat). */
export function getIconImage(name: string, color: string): HTMLImageElement | null {
  const e = imgs.get(`${name}|${color}`);
  return e?.status === "ok" && e.img && e.img.naturalWidth > 0 ? e.img : null;
}

/** Hook: re-render saat icon baru selesai dimuat (masukkan ke dep render). */
export function useIconNotify(): number {
  const [n, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, [force]);
  return n;
}
