"use client";
// Batch 16 v3 — Team Assembly playground (model fisika docs/Orin Playground):
//  · MASKOT ANIMASI (OrinPortrait) — tanpa label nama di playground.
//  · Spawn SEKALI: objek fisika per personaId dibuat satu kali di ref-map;
//    hover/detail TIDAK pernah menyentuhnya; maskot digambar DI ATAS overlay
//    detail (overlay = lapis radial di belakang) → tak ada "respawn" palsu.
//  · HIDUP: scheduler think() ala referensi — rangkaian hop, hop senang di
//    tempat, dengung (sway), jeda; crouch antisipasi sebelum lompat.
//  · GRAVITASI + COLLISION antar maskot: terpisah bermassa, impuls memantul,
//    tabrakan keras → stun; kontak vertikal → BISA SALING TIMPA (stacking).
//  · DRAG & THROW: angkat (held, mengikuti pointer), lempar (kecepatan dari
//    sampel 110ms terakhir, clamp), TAP = sapa (hop kecil senang).
//  · Detail hover: radial overlay transparan→canvas + fade/scale in-out.
//  · Start session: dropdown persona + tombol (≥1 assign). Kartu = toggle
//    assign/unassign. Dekorasi lingkaran ala orbit lama.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonaInfo } from "@yuika/contracts";
import { CaretDown } from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { OrinPortrait } from "./OrinPortrait";
import { Button } from "./ui";
import { useMenuAutoClose } from "./ui/menu";

const MPX = 56; // ukuran OrinPortrait playground
const R = 20; // radius collision — cukup kecil agar menyentuh "skin to skin"

type Mode = "air" | "crouch" | "idle" | "held" | "stun";

type M = {
  pid: string;
  x: number; // px dalam zona (anchor = bawah-tengah maskot)
  y: number;
  vx: number;
  vy: number;
  mode: Mode;
  tm: number; // waktu dalam mode
  nt: number; // jeda sebelum think berikutnya
  hops: number; // sisa rangkaian hop
  hdx: number; // target horizontal hop (px)
  hpow: number;
  sq: number; // squash (0 normal; + memanjang di udara; − crouch)
  sqv: number;
  rot: number;
  lean: number;
  hum: number; // sisa waktu dengung (sway)
  born: number;
  fresh: boolean; // baru spawn → landing pertama = senang
  thrown: boolean;
  cool: number; // cooldown reaksi tabrakan
  support: boolean; // sedang BERDIRI DI ATAS teman (boleh think/friction)
  drag?: {
    ox: number; // offset pointer→posisi maskot
    oy: number;
    samples: { x: number; y: number; t: number }[];
    moved: boolean;
    t0: number;
  };
};

export function TeamSetupView({
  project,
  personas,
  assignedIds,
  onAssign,
  onUnassign,
  onStart,
  busy,
}: {
  project: { id: string; name: string };
  personas: PersonaInfo[];
  assignedIds: string[];
  onAssign: (personaId: string) => void;
  onUnassign: (personaId: string) => void;
  onStart: (p: PersonaInfo) => void;
  busy?: boolean;
}) {
  const [hoverP, setHoverP] = useState<PersonaInfo | null>(null);
  /** Dropdown pemilih lead — pola yang sama dengan dropdown persona header Chat
   *  (details + glass-panel + auto-close: klik luar/Escape/pilih item). */
  const startMenu = useMenuAutoClose<HTMLDetailsElement>();
  /** Detail overlay: persona terakhir + flag tampil → fade OUT dengan scale
   *  mengecil (bukan unmount mendadak). */
  const [detail, setDetail] = useState<{
    p: PersonaInfo;
    show: boolean;
  } | null>(null);
  const [startSel, setStartSel] = useState<string | null>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  /** Mount list — SATU-SATUNYA alasan maskot muncul/hilang (assignment). */
  const [mounted, setMounted] = useState<string[]>([]);
  /** Fisika: ref-map by personaId — DIBUAT SEKALI, tak pernah di-recreate. */
  const bodies = useRef(new Map<string, M>());
  const pointer = useRef({ x: 0, y: 0 });

  // Sinkron mount list dengan assignment (spawn hanya utk persona BARU).
  useEffect(() => {
    setMounted((cur) => {
      if (
        cur.length === assignedIds.length &&
        cur.every((pid, i) => pid === assignedIds[i])
      )
        return cur;
      const el = zoneRef.current;
      const w = el?.clientWidth ?? 260;
      for (const pid of assignedIds) {
        if (!bodies.current.has(pid)) {
          bodies.current.set(pid, {
            pid,
            x: w * (0.34 + Math.random() * 0.32),
            y: 8 + Math.random() * 14,
            vx: (Math.random() - 0.5) * 60,
            vy: 0,
            mode: "air",
            tm: 0,
            nt: 0.8 + Math.random() * 1.6,
            hops: 0,
            hdx: 0,
            hpow: 1,
            sq: 0,
            sqv: 0,
            rot: 0,
            lean: 0,
            hum: 0,
            born: performance.now(),
            fresh: true,
            thrown: false,
            cool: 0,
            support: false,
          });
        }
      }
      for (const pid of cur)
        if (!assignedIds.includes(pid)) bodies.current.delete(pid);
      return assignedIds;
    });
    setStartSel((cur) =>
      cur && assignedIds.includes(cur) ? cur : (assignedIds[0] ?? null),
    );
  }, [assignedIds]);

  useEffect(() => {
    if (hoverP) setDetail({ p: hoverP, show: true });
    else setDetail((d) => (d ? { ...d, show: false } : d));
  }, [hoverP]);

  // ── Fisika: gravitasi + collision + stacking + think scheduler ──────────
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let T = 0;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

    function hop(m: M, dx: number, pw: number) {
      m.mode = "crouch";
      m.tm = 0;
      m.hdx = dx;
      m.hpow = pw;
    }

    function think(m: M, h: number) {
      const r = Math.random();
      const dw = m.x < h ? 1 : m.x > h * 4 ? -1 : Math.random() < 0.5 ? 1 : -1;
      m.tm = 0;
      // jeda lebih panjang + lompatan lebih jarang → tenang, tidak hiperaktif
      m.nt = rnd(1.8, 4.2);
      if (r < 0.34) {
        m.hops = Math.floor(rnd(0, 2));
        hop(m, dw * rnd(0.25, 0.5) * h, rnd(0.85, 1.05));
      } else if (r < 0.46) {
        hop(m, 0, rnd(0.5, 0.65)); // hop senang di tempat (jarang)
      } else if (r < 0.62) {
        m.hum = rnd(1.8, 2.8); // dengung: sway pelan
      }
      // sisanya: diam santai (nt di atas)
    }

    /** INTERAKSI ANTAR MASKOT: dua yang idle saling melompat mendekat lalu
     *  senang bersama (hop ♥ ala updInter 'greet' di referensi). */
    let greetT = 5;
    let greetAt = 0;
    let greetPair: [M, M] | null = null;

    function tryGreet(list: M[], h: number) {
      if (list.length < 2) return;
      const idles = list.filter((m) => m.mode === "idle" && !m.drag);
      if (idles.length < 2) return;
      const a = idles[Math.floor(Math.random() * idles.length)]!;
      let b: M | null = null;
      let bd = Infinity;
      for (const m of idles) {
        if (m === a) continue;
        const d = Math.abs(m.x - a.x);
        if (d < bd) {
          bd = d;
          b = m;
        }
      }
      if (!b) return;
      const dx = (b as M).x - a.x;
      const dist = Math.abs(dx);
      if (dist < R * 2 + 26 || dist > 3.2 * h) return;
      const dir = Math.sign(dx) || 1;
      const each = dist / 2 - 14;
      hop(a, dir * each, 1);
      hop(b as M, -dir * each, 1);
      greetPair = [a, b as M];
      greetAt = T + 1.5; // setelah saling mendarat dekat → lompat senang
    }

    function upd(m: M, dt: number, w: number, h: number) {
      m.tm += dt;
      m.cool -= dt;
      if (m.hum > 0) m.hum -= dt;
      m.support = false; // di-set ulang oleh collide() bila menimpa teman
      const G = 3.6 * h;
      const floor = h - MPX;
      let grounded = false;

      if (m.mode === "held" && m.drag) {
        const k = Math.min(1, dt * 22);
        m.x += (pointer.current.x - m.drag.ox - m.x) * k;
        m.y += (pointer.current.y - m.drag.oy - m.y) * k;
        m.vx = 0;
        m.vy = 0;
      } else {
        m.vy += G * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y >= floor) {
          m.y = floor;
          grounded = true;
          if (m.vy > 0) {
            const im = m.vy;
            if (im > 1.5 * h && (m.mode === "air" || m.mode === "stun")) {
              m.vy = -im * 0.32; // pantulan lemparan keras
              m.sqv -= (im / h) * 0.22;
            } else {
              m.vy = 0;
              if (m.mode === "air" || m.mode === "stun") {
                m.sqv -= (im / h) * 0.16;
                m.vx *= 0.25;
                if (m.fresh) m.fresh = false;
                if (m.thrown) {
                  m.thrown = false;
                  if (im > 1.6 * h) {
                    m.mode = "stun";
                    m.tm = 0;
                  }
                }
                // DARAT → idle (tanpa ini maskot terjebak mode "air" dan
                // scheduler think() tidak pernah jalan → terasa mati)
                if (m.mode === "air" || m.mode === "stun") {
                  m.mode = "idle";
                  m.tm = 0;
                  m.nt = rnd(0.5, 1.4);
                }
              }
            }
          }
        }
        const lo = MPX / 2;
        const hi = w - MPX / 2;
        if (m.x < lo) {
          m.x = lo;
          m.vx = Math.abs(m.vx) * 0.5;
        } else if (m.x > hi) {
          m.x = hi;
          m.vx = -Math.abs(m.vx) * 0.5;
        }
        if ((grounded || m.support) && m.mode !== "air")
          m.vx *= Math.exp(-9 * dt);
        if (m.mode === "crouch") {
          if (m.tm >= 0.18) {
            const vy = -(1.35 + rnd(0, 0.25)) * h * m.hpow;
            m.vy = vy;
            m.vx = m.hdx / ((2 * -vy) / G);
            m.mode = "air";
            m.tm = 0;
          }
        } else if (m.mode === "stun") {
          if (m.tm > 0.7 && grounded) {
            m.mode = "idle";
            m.tm = 0;
          }
        } else if (m.mode === "idle" && (grounded || m.support)) {
          if (m.hops > 0) {
            m.hops--;
            hop(m, m.hdx, 0.9);
          } else if (m.tm > m.nt) {
            think(m, h);
          }
        }
      }
      // squash spring
      const sqT =
        m.mode === "crouch"
          ? -0.2
          : m.mode === "air"
            ? cl((Math.abs(m.vy) / h) * 0.28, 0, 0.17)
            : 0;
      m.sqv += ((sqT - m.sq) * 260 - m.sqv * 22) * dt;
      m.sq += m.sqv * dt;
      // rotasi: held → ikut kecepatan lempar; udara → miring by vx; dengung → sway
      m.lean *= Math.exp(-6 * dt);
      const rt =
        m.mode === "held"
          ? cl((m.vx / h) * 0.9, -0.45, 0.45)
          : (m.mode === "air" ? cl((m.vx / h) * 0.9, -0.25, 0.25) : 0) +
            (m.hum > 0 ? Math.sin(T * 6) * 0.1 : 0) +
            m.lean;
      m.rot += (rt - m.rot) * Math.min(1, dt * 12);
    }

    function collide(a: M, b: M, h: number) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const mn = R * 2;
      if (d >= mn) return;
      const nx = dx / d;
      const ny = dy / d;
      const ov = mn - d;
      const ma = a.mode === "held" ? 1e6 : 1;
      const mb = b.mode === "held" ? 1e6 : 1;
      const ta = mb / (ma + mb);
      const tb = ma / (ma + mb);
      a.x -= nx * ov * ta;
      a.y -= ny * ov * ta;
      b.x += nx * ov * tb;
      b.y += ny * ov * tb;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const ip = (-1.35 * rel) / (1 / ma + 1 / mb);
        a.vx -= (ip * nx) / ma;
        a.vy -= (ip * ny) / ma;
        b.vx += (ip * nx) / mb;
        b.vy += (ip * ny) / mb;
        if (-rel > 1.8 * h && a.cool <= 0 && b.cool <= 0) {
          for (const m of [a, b]) {
            m.cool = 0.6;
            if (m.mode === "held") continue;
            m.lean += (Math.random() - 0.5) * 0.4;
            if (-rel > 2.6 * h) {
              m.mode = "stun";
              m.tm = 0;
            } else if (m.mode === "idle") {
              hop(m, 0, 0.55); // kaget kecil
            }
          }
        }
      }
      // STACKING: kontak nyaris vertikal → yang di atas DIJUNTIng diam di atas
      // yang di bawah (bisa saling timpa), geser sedikit biar tak sempurna.
      if (Math.abs(nx) < 0.5) {
        const up = a.y < b.y ? a : b;
        const lw = up === a ? b : a;
        if (up.mode !== "held") {
          up.x += (up.x >= lw.x ? 1 : -1) * 0.35;
          up.support = true; // berdiri di atas teman → tetap bisa diam/think
          if (Math.abs(up.vy) < 0.5 * h) {
            up.vy = Math.min(up.vy, 0);
            up.vx *= 0.92;
            if (up.mode === "air") {
              up.mode = "idle";
              up.tm = 0;
              up.nt = rnd(0.6, 1.6);
            }
          }
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
        for (const m of list) upd(m, dt, w, h);
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++)
            collide(list[i]!, list[j]!, h);
        // interaksi greet berkala antar maskot
        greetT -= dt;
        if (greetT <= 0) {
          greetT = rnd(7, 15);
          tryGreet(list, h);
        }
        if (greetPair && T >= greetAt) {
          for (const m of greetPair)
            if (m.mode === "idle" && !m.drag) {
              hop(m, 0, 0.6);
              m.hum = 1.6;
            }
          greetPair = null;
        }
        // render imperatif — React tidak ikut 60fps
        el.querySelectorAll<HTMLElement>("[data-mascot]").forEach((n) => {
          const m = bodies.current.get(n.dataset.mascot!);
          if (!m) return;
          n.style.transform = `translate(-50%, -100%) translate(${m.x}px, ${m.y}px) rotate(${m.rot}rad) scaleY(${1 - m.sq}) scaleX(${1 + m.sq * 0.9})`;
          const age = (performance.now() - m.born) / 1000;
          if (age < 0.6) {
            // SPAWN sekali: mengecil dari preview → jatuh ke playground
            n.style.scale = String(Math.max(1, 2.6 - age * 2.9));
            n.style.opacity = String(Math.min(1, age * 3.5));
          } else {
            n.style.scale = "1";
            n.style.opacity = "1";
          }
          const btn = n.firstElementChild as HTMLElement | null;
          if (btn) btn.style.cursor = m.mode === "held" ? "grabbing" : "grab";
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mounted]);

  // ── Drag & throw / tap-greet ─────────────────────────────────────────────
  const zonePoint = useCallback((e: React.PointerEvent) => {
    const r = zoneRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const onGrabStart = useCallback(
    (pid: string, e: React.PointerEvent) => {
      const m = bodies.current.get(pid);
      if (!m) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = zonePoint(e);
      pointer.current = p;
      m.mode = "held";
      m.hops = 0;
      m.drag = {
        ox: p.x - m.x,
        oy: p.y - m.y,
        samples: [{ ...p, t: performance.now() }],
        moved: false,
        t0: performance.now(),
      };
    },
    [zonePoint],
  );

  const onGrabMove = useCallback(
    (pid: string, e: React.PointerEvent) => {
      const m = bodies.current.get(pid);
      if (!m || !m.drag) return;
      const p = zonePoint(e);
      pointer.current = p;
      const n = performance.now();
      m.drag.samples.push({ ...p, t: n });
      while (m.drag.samples.length > 2 && n - m.drag.samples[0]!.t > 110)
        m.drag.samples.shift();
      if (
        Math.hypot(m.drag.samples[0]!.x - p.x, m.drag.samples[0]!.y - p.y) >
          8 ||
        n - m.drag.t0 > 350
      )
        m.drag.moved = true;
    },
    [zonePoint],
  );

  const onGrabEnd = useCallback(
    (pid: string, e: React.PointerEvent, h: number) => {
      const m = bodies.current.get(pid);
      if (!m || !m.drag) return;
      const s = m.drag.samples;
      const tap = !m.drag.moved && performance.now() - m.drag.t0 < 350;
      m.drag = undefined;
      if (tap) {
        // TAP = sapa: hop kecil senang di tempat
        m.mode = "air";
        m.vy = -1.1 * h;
        m.vx = (Math.random() - 0.5) * 0.3 * h;
        m.sqv += 2.2;
      } else {
        // THROW: kecepatan dari sampel ≤110ms terakhir
        const f = s[0]!;
        const l = s[s.length - 1]!;
        const dtm = (l.t - f.t) / 1000 || 0.016;
        m.mode = "air";
        m.thrown = true;
        m.vx = Math.max(-4.5 * h, Math.min(4.5 * h, (l.x - f.x) / dtm));
        m.vy = Math.max(-4.5 * h, Math.min(3 * h, (l.y - f.y) / dtm));
        m.sqv -= 1.4;
      }
      void e;
    },
    [],
  );

  const n = Math.max(personas.length, 1);
  const ringCards = useMemo(
    () =>
      personas.map((p, i) => {
        const a = (-90 + (360 / n) * i) * (Math.PI / 180);
        return {
          p,
          left: `${50 + 46 * Math.cos(a)}%`,
          top: `${50 + 40 * Math.sin(a)}%`,
        };
      }),
    [personas, n],
  );

  const assignedPersonas = personas.filter((p) => assignedIds.includes(p.id));
  const startLead =
    personas.find((x) => x.id === startSel) ?? assignedPersonas[0] ?? null;
  const zoneH = 170; // perkiraan tinggi zona (utk release-throw scaling)

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-8 justify-center">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-semibold text-primary">Build Your Team</h1>
      </div>

      {/* ── Panggung ala orbit lama ─────────────────────────────────────── */}
      <div className="relative mt-2 h-[460px] w-full max-w-[720px] select-none sm:h-[500px]">
        {/* Dekorasi lingkaran konsentris (orbit lama) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/2 left-1/2 h-[80%] w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-line/70" />
          <div className="absolute top-1/2 left-1/2 h-[52%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/80" />
          <div className="absolute top-1/2 left-1/2 h-[35%] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/90" />
        </div>

        {/* DETAIL hover (z-30, DI ATAS playground — bring to front): radial
            transparan→canvas, fade+scale; pointer-events-none sehingga kartu
            di tepi tetap bisa di-hover/klik. Maskot tetap hidup di belakang. */}
        {detail && (
          <div
            key={detail.p.id}
            aria-live="polite"
            className={`pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 px-16 text-center transition-all ease-[var(--ease-out-yui)] duration-300 sm:px-20 ${
              detail.show ? "opacity-100 scale-100" : "opacity-0 scale-75"
            }`}
            style={{
              background:
                "radial-gradient(ellipse 62% 52% at center, var(--color-canvas) 52%, transparent 100%)",
            }}
          >
            <OrinPortrait state="idle" personaId={detail.p.id} size={170} />
            <b className="text-title font-semibold text-primary">
              {detail.p.name}
            </b>
            <p className="max-w-[320px] text-body leading-6 text-muted">
              {detail.p.description}
            </p>
          </div>
        )}

        {/* PLAYGROUND (z-20): zona fisik TENGAH — tanpa background & tanpa
            label; maskot ANIMASI bisa di-drag, dilempar, saling menimpa. */}
        <div
          ref={zoneRef}
          className="absolute top-1/2 left-1/2 z-20 h-[34%] w-[38%] -translate-x-1/2 -translate-y-1/2"
          role="presentation"
        >
          {mounted.map((pid) => {
            const p = personas.find((x) => x.id === pid);
            if (!p) return null;
            return (
              <div
                key={pid}
                data-mascot={pid}
                className="absolute top-0 left-0 flex flex-col items-center will-change-transform"
                style={{ width: MPX }}
              >
                <button
                  type="button"
                  aria-label={`Play with ${p.name}`}
                  title={`${p.name} — drag to toss, tap to greet`}
                  className="pointer-events-auto cursor-grab touch-none border-0 bg-transparent p-0"
                  onPointerDown={(e) => onGrabStart(pid, e)}
                  onPointerMove={(e) => onGrabMove(pid, e)}
                  onPointerUp={(e) => onGrabEnd(pid, e, zoneH)}
                  onPointerCancel={(e) => onGrabEnd(pid, e, zoneH)}
                >
                  <OrinPortrait state="idle" personaId={p.id} size={MPX} />
                </button>
              </div>
            );
          })}
        </div>

        {/* RING kartu float ala orbit lama (klik = assign / unassign) */}
        {ringCards.map(({ p, left, top }, i) => {
          const assigned = assignedIds.includes(p.id);
          return (
            <div
              key={p.id}
              className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
              style={{ left, top }}
            >
              <button
                type="button"
                onMouseEnter={() => setHoverP(p)}
                onMouseLeave={() => setHoverP(null)}
                onFocus={() => setHoverP(p)}
                onBlur={() => setHoverP(null)}
                onClick={() => (assigned ? onUnassign(p.id) : onAssign(p.id))}
                aria-pressed={assigned}
                aria-label={p.name}
                title={
                  assigned
                    ? `${p.name} is on the team — click to remove`
                    : `Assign ${p.name} to this project`
                }
                style={{ animationDelay: `${(i * 1.1).toFixed(1)}s` }}
                className={`relative flex w-[130px] cursor-pointer flex-col items-center gap-1.5 rounded-card border px-3.5 py-3 text-center shadow-card transition-[background-color,border-color,color,box-shadow] ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] motion-safe:float-yui ${
                  assigned
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-surface hover:border-line-strong hover:bg-hover"
                }`}
              >
                <PersonaFace personaId={p.id} size={40} />
                <b className="text-caption font-semibold text-secondary">
                  {p.name}
                </b>
                {assigned && (
                  <i
                    className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white"
                    aria-hidden
                  >
                    ✓
                  </i>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Start session: dropdown persona + tombol (≥1 assigned) ───────── */}
      <div
        className="mt-3 flex min-h-[40px] items-center gap-5"
        aria-live="polite"
      >
        {assignedPersonas.length > 0 && startLead ? (
          <>
            <details className="group relative" ref={startMenu.ref}>
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md2 border border-line bg-control px-3 py-1.5 text-caption text-secondary select-none transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-line-strong hover:text-primary [&::-webkit-details-marker]:hidden">
                <PersonaFace personaId={startLead.id} size={18} />
                <span className="flex min-w-0 flex-col text-left">
                  <b className="text-body font-semibold text-primary">
                    {startLead.name}
                  </b>
                </span>
                <CaretDown size={12} aria-hidden />
              </summary>
              <div className="glass-panel absolute bottom-full right-0 z-30 mb-1 flex max-h-[260px] w-[260px] flex-col gap-px overflow-y-auto rounded-lg2 p-1 shadow-pop">
                {assignedPersonas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-current={p.id === startLead.id ? "true" : undefined}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-md2 border px-2 py-1.5 text-left transition-colors ${
                      p.id === startLead.id
                        ? "border-line bg-hover"
                        : "border-transparent hover:bg-hover"
                    }`}
                    onClick={() => {
                      setStartSel(p.id);
                      startMenu.close();
                    }}
                  >
                    <PersonaFace personaId={p.id} size={20} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body text-secondary">
                        {p.name}
                      </span>
                      <small className="truncate text-caption text-dim">
                        {p.expertise}
                      </small>
                    </span>
                    {p.id === startLead.id && (
                      <i className="text-accent" aria-hidden>
                        ✓
                      </i>
                    )}
                  </button>
                ))}
              </div>
            </details>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => onStart(startLead)}
            >
              {busy ? "Opening…" : "Start session"}
            </Button>
          </>
        ) : (
          <span className="text-caption text-dim">
            Assign at least one persona as your partner
          </span>
        )}
      </div>
    </div>
  );
}
