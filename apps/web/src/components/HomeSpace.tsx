"use client";
// D44/D45: PLAYGROUND latar HOME — maskot zero-g melayang di area MAIN saja
// (kotak fixed diukur dari rect parent = root HomeView, via ResizeObserver,
// jadi tak pernah masuk area sidebar walau sidebar toggle). TANPA bintang/
// nebula (D45: latar biasa). Fisika: tanpa gravitasi/lompat; drift "angin
// luar angkasa" pelan, wrap tepi area, tumble; drag & throw (sampel ≤110ms)
// + collision bermassa dipertahankan. Render imperatif per-frame, ala
// TeamSetupView.
import { useCallback, useEffect, useRef, useState } from "react";
import { OrinPortrait } from "./OrinPortrait";

const S = 44; // ukuran maskot (D45: balik ke 44 setelah 2x terbukti terlalu besar)
const R = 19; // radius collision (skala dengan S)

type Body = {
  pid: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rv: number; // kecepatan tumble (spin)
  ph: number; // fase sway/bob per maskot
  cool: number;
  born: number;
  windT: number;
  wx: number;
  wy: number;
  drag?: {
    ox: number;
    oy: number;
    samples: { x: number; y: number; t: number }[];
    moved: boolean;
    t0: number;
  };
};

export function HomeSpace({
  personas,
  fit = "parent",
}: {
  /** Minimal {id,name}; PersonaInfo lengkap juga oke (structural). */
  personas: { id: string; name: string }[];
  /** "parent" = fit ke rect parent (area main Home, D45); "viewport" =
   *  full satu layar (D46: background gerbang login). Default "parent". */
  fit?: "parent" | "viewport";
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const bodies = useRef(new Map<string, Body>());
  const [mounted, setMounted] = useState<string[]>([]);

  // Kotak fixed mengikuti rect parent (root main HomeView): sidebar toggle,
  // resize, dsb. — ResizeObserver menjaga agar box selalu pas area main.
  // (Hanya fit="parent"; fit="viewport" pakai inset-0 murni.)
  useEffect(() => {
    if (fit !== "parent") return;
    const el = zoneRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const fitBox = () => {
      const r = parent.getBoundingClientRect();
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
    };
    fitBox();
    const ro = new ResizeObserver(fitBox);
    ro.observe(parent);
    window.addEventListener("resize", fitBox);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fitBox);
    };
  }, [fit]);

  // Sinkron daftar maskot dengan prop (mount/hapus body, spawn scatter).
  useEffect(() => {
    setMounted(personas.map((p) => p.id));
    const el = zoneRef.current;
    const w = el?.clientWidth ?? window.innerWidth;
    const h = el?.clientHeight ?? window.innerHeight;
    for (const pid of personas.map((p) => p.id)) {
      if (bodies.current.has(pid)) continue;
      const a = Math.random() * Math.PI * 2;
      bodies.current.set(pid, {
        pid,
        x: 0.1 * w + Math.random() * 0.8 * w,
        y: 0.12 * h + Math.random() * 0.76 * h,
        vx: Math.cos(a) * 10,
        vy: Math.sin(a) * 10,
        rot: (Math.random() - 0.5) * 0.5,
        rv: (Math.random() - 0.5) * 0.4,
        ph: Math.random() * Math.PI * 2,
        cool: 0,
        born: performance.now(),
        windT: 0,
        wx: 0,
        wy: 0,
      });
    }
    for (const pid of [...bodies.current.keys()])
      if (!personas.some((p) => p.id === pid)) bodies.current.delete(pid);
  }, [personas]);

  // ── Fisika zero-g: drift + damping-lembut + collision + wrap ────────────
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    let raf = 0;
    let last = performance.now();
    let T = 0;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    function upd(b: Body, dt: number, w: number, h: number) {
      b.cool -= dt;
      b.windT -= dt;
      if (b.drag) {
        const k = Math.min(1, dt * 22);
        b.x += (pointer.current.x - b.drag.ox - b.x) * k;
        b.y += (pointer.current.y - b.drag.oy - b.y) * k;
        b.vx = 0;
        b.vy = 0;
      } else {
        // "angin luar angkasa": target drift pelan, re-pick berkala; tarikan
        // lembut ke arah itu = damping alami untuk lemparan (tanpa gesek).
        if (b.windT <= 0) {
          const a = Math.random() * Math.PI * 2;
          const s = rnd(10, 22);
          b.wx = Math.cos(a) * s;
          b.wy = Math.sin(a) * s;
          b.windT = rnd(3, 7);
        }
        const pull = Math.min(1, 0.3 * dt);
        b.vx += (b.wx - b.vx) * pull;
        b.vy += (b.wy - b.vy) * pull;
        const sp = Math.hypot(b.vx, b.vy);
        const mx = 900;
        if (sp > mx) {
          b.vx = (b.vx / sp) * mx;
          b.vy = (b.vy / sp) * mx;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        // wrap: melayang keluar sisi → muncul dari sisi seberang
        const m = S;
        if (b.x < -m) b.x = w + m;
        else if (b.x > w + m) b.x = -m;
        if (b.y < -m) b.y = h + m;
        else if (b.y > h + m) b.y = -m;
        // tumble: spin ter-damp, plus sway sinus pelan (melayang hidup)
        b.rv *= Math.exp(-0.6 * dt);
        b.rot += (b.rv + Math.sin(T * 0.7 + b.ph) * 0.05) * dt;
      }
    }

    /** Tabrakan bermassa (held = super berat); restitusi lentur + spin kick. */
    function collide(a: Body, b: Body) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const mn = R * 2;
      if (d >= mn) return;
      const nx = dx / d;
      const ny = dy / d;
      const ov = mn - d;
      const ma = a.drag ? 1e6 : 1;
      const mb = b.drag ? 1e6 : 1;
      const ta = mb / (ma + mb);
      const tb = ma / (ma + mb);
      a.x -= nx * ov * ta;
      a.y -= ny * ov * ta;
      b.x += nx * ov * tb;
      b.y += ny * ov * tb;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const ip = (-1.3 * rel) / (1 / ma + 1 / mb);
        a.vx -= (ip * nx) / ma;
        a.vy -= (ip * ny) / ma;
        b.vx += (ip * nx) / mb;
        b.vy += (ip * ny) / mb;
        if (-rel > 120 && a.cool <= 0 && b.cool <= 0) {
          a.cool = 0.5;
          b.cool = 0.5;
          // benturan kencang → tumble (spin), khas zero-g
          const kick = Math.min(4, -rel / 260);
          a.rv += rnd(-kick, kick);
          b.rv += rnd(-kick, kick);
        }
      }
    }

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      T += dt;
      const el = zoneRef.current;
      if (el && el.clientWidth > 0) {
        const w = el.clientWidth;
        const h = el.clientHeight;
        const list = mounted
          .map((pid) => bodies.current.get(pid)!)
          .filter(Boolean);
        for (const b of list) upd(b, dt, w, h);
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++)
            collide(list[i]!, list[j]!);
        // render imperatif
        el.querySelectorAll<HTMLElement>("[data-mascot]").forEach((n) => {
          const b = bodies.current.get(n.dataset.mascot!);
          if (!b) return;
          const bob = Math.sin(T * 0.9 + b.ph) * 4;
          n.style.transform = `translate(-50%, -50%) translate(${b.x}px, ${b.y + bob}px) rotate(${b.rot}rad)`;
          const age = (performance.now() - b.born) / 1000;
          if (age < 0.6) {
            // spawn: membesar dari jauh → melayang masuk
            n.style.scale = String(Math.max(1, 1.9 - age * 1.5));
            n.style.opacity = String(Math.min(1, age * 3.5));
          } else {
            n.style.scale = "1";
            n.style.opacity = "1";
          }
          const btn = n.firstElementChild as HTMLElement | null;
          if (btn) btn.style.cursor = b.drag ? "grabbing" : "grab";
        });
      }
      raf = requestAnimationFrame(tick);
    };

    if (reduced) {
      // reduced-motion: satu pass posisi statis, tanpa animasi
      const el = zoneRef.current;
      el?.querySelectorAll<HTMLElement>("[data-mascot]").forEach((n) => {
        const b = bodies.current.get(n.dataset.mascot!);
        if (!b) return;
        n.style.transform = `translate(-50%, -50%) translate(${b.x}px, ${b.y}px)`;
      });
      return;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mounted]);

  // ── Drag & throw (pinch pointer) ────────────────────────────────────────
  const zonePoint = useCallback((e: React.PointerEvent) => {
    const r = zoneRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const onGrabStart = useCallback(
    (pid: string, e: React.PointerEvent) => {
      const b = bodies.current.get(pid);
      if (!b) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = zonePoint(e);
      pointer.current = p;
      b.drag = {
        ox: p.x - b.x,
        oy: p.y - b.y,
        samples: [{ ...p, t: performance.now() }],
        moved: false,
        t0: performance.now(),
      };
    },
    [zonePoint],
  );

  const onGrabMove = useCallback(
    (pid: string, e: React.PointerEvent) => {
      const b = bodies.current.get(pid);
      if (!b || !b.drag) return;
      const p = zonePoint(e);
      pointer.current = p;
      const n = performance.now();
      b.drag.samples.push({ ...p, t: n });
      while (b.drag.samples.length > 2 && n - b.drag.samples[0]!.t > 110)
        b.drag.samples.shift();
      if (
        Math.hypot(b.drag.samples[0]!.x - p.x, b.drag.samples[0]!.y - p.y) >
          8 ||
        n - b.drag.t0 > 350
      )
        b.drag.moved = true;
    },
    [zonePoint],
  );

  const onGrabEnd = useCallback((pid: string) => {
    const b = bodies.current.get(pid);
    if (!b || !b.drag) return;
    const s = b.drag.samples;
    const tap = !b.drag.moved && performance.now() - b.drag.t0 < 350;
    b.drag = undefined;
    if (tap) {
      // TAP = dorongan kecil khas zero-g: hentak pelan + tumble
      const a = Math.random() * Math.PI * 2;
      b.vx = Math.cos(a) * 110;
      b.vy = Math.sin(a) * 110 - 40;
      b.rv += (Math.random() - 0.5) * 2.4;
    } else {
      // THROW: kecepatan dari sampel ≤110ms terakhir
      const f = s[0]!;
      const l = s[s.length - 1]!;
      const dtm = (l.t - f.t) / 1000 || 0.016;
      b.vx = Math.max(-900, Math.min(900, (l.x - f.x) / dtm));
      b.vy = Math.max(-900, Math.min(900, (l.y - f.y) / dtm));
      b.rv += (Math.random() - 0.5) * Math.min(3, Math.abs(b.vx) / 300);
    }
  }, []);

  return (
    // Kotak fixed di-fit ke rect parent (area main) oleh effect di atas;
    // pointer-events hanya pada tombol maskot. fit="viewport" → inset-0.
    <div
      ref={zoneRef}
      role="presentation"
      className={
        fit === "viewport"
          ? "pointer-events-none fixed inset-0 z-0 overflow-hidden"
          : "pointer-events-none fixed z-0 overflow-hidden"
      }
    >
      {mounted.map((pid) => {
        const p = personas.find((x) => x.id === pid);
        if (!p) return null;
        return (
          <div
            key={pid}
            data-mascot={pid}
            className="absolute top-0 left-0 flex flex-col items-center opacity-0 will-change-transform"
            style={{ width: S }}
          >
            <button
              type="button"
              aria-label={`Play with ${p.name}`}
              title={`${p.name}, drag to toss`}
              className="pointer-events-auto cursor-grab touch-none border-0 bg-transparent p-0"
              onPointerDown={(e) => onGrabStart(pid, e)}
              onPointerMove={(e) => onGrabMove(pid, e)}
              onPointerUp={() => onGrabEnd(pid)}
              onPointerCancel={() => onGrabEnd(pid)}
            >
              <OrinPortrait state="idle" personaId={p.id} size={S} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
