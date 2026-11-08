"use client";
// Menu auto-close (fix test user #6): dropdown <details> di header menutup
// otomatis saat (a) klik/pointer di luar menu, (b) tombol Escape, (c) salah
// satu item dipilih (pemanggil memanggil close() di onClick item).
// Accordion (Thinking/Trace/Settings) BUKAN menu, tetap perilaku native.
import { useEffect, useRef } from "react";

export function useMenuAutoClose<T extends HTMLDetailsElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    // Read ref.current LIVE on every event: the details element can mount
    // LATE (e.g. the Sessions menu after a project loads); capturing el
    // once at mount leaves a dead listener and outside clicks never close.
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key === "Escape" && el?.open) el.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  return { ref, close };
}
