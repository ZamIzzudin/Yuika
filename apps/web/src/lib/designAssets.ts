"use client";
// D92: cache aset image desain (shape type "image" + background frame).
// src = path relatif workspace (hasil POST /api/uploads) atau URL http(s).
// Path relatif diambil via authFetch → Blob → objectURL (token tetap di
// header; tidak pernah bocor ke <img src>). onload → notify → re-render.
import { useEffect, useReducer } from "react";
import { apiUrl, authFetch } from "@/lib/api";

interface Asset {
  status: "loading" | "ok" | "err";
  url?: string; // objectURL / URL http(s) asli
  img?: HTMLImageElement;
}

const cache = new Map<string, Asset>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

/** Minta aset dimuat (idempoten). Bila selesai (ok/err) → notify sekali. */
export function loadAsset(src: string): void {
  if (cache.has(src)) return;
  const a: Asset = { status: "loading" };
  cache.set(src, a);
  if (/^https?:\/\//i.test(src)) {
    a.url = src;
    const img = new Image();
    img.onload = () => {
      a.status = "ok";
      a.img = img;
      notify();
    };
    img.onerror = () => {
      a.status = "err";
      notify();
    };
    img.src = src;
    return;
  }
  void (async () => {
    try {
      const r = await authFetch(apiUrl(`/api/uploads?path=${encodeURIComponent(src)}`));
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      a.url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("decode failed"));
        img.src = a.url!;
      });
      a.status = "ok";
      a.img = img;
    } catch {
      a.status = "err";
    }
    notify();
  })();
}

/** Gambar siap-pakai utk drawImage (null bila belum / gagal). */
export function getAssetImage(src: string): HTMLImageElement | null {
  const a = cache.get(src);
  return a?.status === "ok" && a.img && a.img.naturalWidth > 0 ? a.img : null;
}

/** objectURL utk <img> (null bila belum siap) — prototype preview. */
export function getAssetUrl(src: string): string | null {
  loadAsset(src);
  return cache.get(src)?.status === "ok" ? cache.get(src)!.url! : null;
}

/** Hook: re-render komponen saat aset baru selesai dimuat; return tick
 *  (masukkan ke dependency effect render canvas). */
export function useAssetNotify(): number {
  const [n, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, [force]);
  return n;
}
