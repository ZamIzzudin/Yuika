"use client";
/**
 * OrinPortrait v8 — maskot Orin + SISTEM AKSI IDLE (docs/orin_v8_larger_star.html).
 * Rig & keyframe dipindah 1:1 dari halaman sumber v6/v8: badan ber-GRADIENT
 * radial 3-stop + soft shadow, mata kapsul gelap + KILAU (glint) ganda,
 * geometri 15 bentuk organik membulat (orinShapes v8), bintang diskalakan 1.18×
 * pada siluet saja (wajah tidak — rig bersama konsisten).
 * SATU rig mata dipakai semua bentuk. Identitas persona = bentuk.
 *
 * Mapping PersonaState (7) → mood (6):
 *   idle→idle · thinking→thinking · working→speaking (halo) ·
 *   awaiting_input→listening (mata besar) · done/celebrating→happy (mata "^") ·
 *   error→confused. celebrating men-trigger bounce ekstra.
 *
 * Aksi idle (BARU v4.2) — hanya saat mood idle & user tak menggerakkan kursor 5 dtk:
 *   melirik (look) · giggle · senandung (hum + not ♪) · penasaran (tilt) ·
 *   menguap (yawn) · cegukan (hiccup). Idle 45 dtk → menguap → TIDUR (mata sipit,
 *   "z" melayang); interaksi apa pun (gerak/klik/tik) membangunkan dengan animasi wake.
 *   Aksi menimpa mood via layer `ov` (smoothing lambat) — mood agent tak diganggu.
 *
 * FX layer: "..." (thinking) · "?" (confused) · ♪ (hum) · z (sleep) — fade + melayang.
 *
 * Rig ini FINAL (Rive dibatalkan 2026-11 — jalur .riv dicabut; dokumen arsip
 * docs/ART-DIRECTION.md). Urutan bentuk resmi: SHAPE_ORDER di orinShapes.tsx.
 */
import { useEffect, useId, useRef } from "react";
import type { PersonaState } from "@yuika/contracts";
import { mixHex, usePersonaShape } from "./orinShapes";

type MoodName =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "happy"
  | "confused";

/** Aksi idle — durasi (dtk) persis ACT di halaman sumber v4(2). */
type IdleAction = "look" | "giggle" | "hum" | "tilt" | "yawn" | "hiccup" | "wake";
const ACT: Record<IdleAction, number> = {
  look: 2.6,
  giggle: 1.5,
  hum: 3.6,
  tilt: 2.2,
  yawn: 2.4,
  hiccup: 0.5,
  wake: 0.7,
};

const MOOD: Record<PersonaState, MoodName> = {
  idle: "idle",
  thinking: "thinking",
  working: "speaking",
  awaiting_input: "listening",
  done: "happy",
  celebrating: "happy",
  error: "confused",
};

// rig params — persis B di halaman sumber v8
const B = {
  ew: 30,
  eh: 68,
  gap: 34,
  gx: 0,
  gy: 0,
  tilt: 0,
  hap: 0,
  by: 0,
  sy: 1,
  rot: 0,
  ring: 0,
  halo: 0,
  ey: 0,
};
type Rig = typeof B;
const mk = (o: Partial<Rig> = {}): Rig => ({ ...B, ...o });

// keyframe per mood — persis S di halaman sumber v8
const S: Record<MoodName, Rig> = {
  idle: mk(),
  listening: mk({ ew: 31, eh: 78, gap: 36, by: -7, sy: 1.035, ring: 1, ey: -7 }),
  thinking: mk({ ew: 28, eh: 55, tilt: 11, gx: -0.7, gy: -0.8, rot: -3 }),
  speaking: mk({ halo: 1, by: -3 }),
  happy: mk({ ew: 30, eh: 56, gap: 43, hap: 1, by: -12, sy: 1.045, rot: 2.5, ey: -4 }),
  confused: mk({ ew: 28, eh: 56, tilt: 18, gx: 0.3, rot: 7 }),
};

const EYE_INK = "#11121A";
const TAU = 6.2832;

export function OrinPortrait({
  state,
  personaId,
  size = 190,
}: {
  state: PersonaState;
  personaId?: string;
  size?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const faceRef = useRef<SVGGElement>(null);
  const eLRef = useRef<SVGGElement>(null);
  const eRRef = useRef<SVGGElement>(null);
  const cLRef = useRef<SVGRectElement>(null);
  const cRRef = useRef<SVGRectElement>(null);
  const aLRef = useRef<SVGPathElement>(null);
  const aRRef = useRef<SVGPathElement>(null);
  // v8: kilau mata (glint utama + sekunder) — hidup di atas kapsul gelap
  const glLRef = useRef<SVGCircleElement>(null);
  const glsLRef = useRef<SVGCircleElement>(null);
  const glRRef = useRef<SVGCircleElement>(null);
  const glsRRef = useRef<SVGCircleElement>(null);
  const r1Ref = useRef<SVGCircleElement>(null);
  const r2Ref = useRef<SVGCircleElement>(null);
  const haloRef = useRef<SVGCircleElement>(null);
  // FX layer: [d0,d1,d2, q0,q1, n0,n1, z0,z1,z2]
  const fxRef = useRef<(SVGElement | null)[]>([]);

  const { key: shapeKey, shape } = usePersonaShape(personaId);
  const shapeKeyOrb = shapeKey === "orb";
  const gid = useId(); // id gradient/filter unik per instance (banyak Orin di 1 halaman)
  const gradId = `orinBody-${gid.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const shadowId = `orinShadow-${gid.replace(/[^a-zA-Z0-9-]/g, "")}`;
  // stop gradient badan — persis paintBody v8 (terang → warna → bayangan)
  const cLight = mixHex(shape.color, "#FFFFFF", 0.48);
  const cShade = mixHex(shape.color, "#151728", 0.34);

  const tgtRef = useRef<Rig>(S[MOOD[state]]);
  const moodRef = useRef<MoodName>(MOOD[state]);
  const overrideUntilRef = useRef(0);
  const bumpRef = useRef(0);

  useEffect(() => {
    const prev = moodRef.current;
    moodRef.current = MOOD[state];
    if (performance.now() > overrideUntilRef.current)
      tgtRef.current = S[MOOD[state]];
    if (state === "celebrating") bumpRef.current = 1; // bounce ekstra saat merayakan
    // aktivitas agent membangunkan tidur (persis set() di sumber: wake anim)
    wakeRef.current = prev !== moodRef.current;
  }, [state]);

  // sinyal dari efek prop → loop animasi (agent bangun karena mood berubah)
  const wakeRef = useRef(false);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const cur = mk();
    const sc = { fy: shape.fy, gs: shape.gs, es: shape.es, gr: shape.gr }; // konstan — bentuk statis per instance
    // layer override aksi idle (smooth lambat: tidur 2.8, aktif 16 — v8)
    const ov = { gx: 0, gy: 0, by: 0, sy: 0, rot: 0, hap: 0, eh: 1, ey: 0, tilt: 0, gap: 0, mo: 0 };
    const fxv = { dots: 0, q: 0, notes: 0, z: 0 };
    let raf = 0;
    const t0 = performance.now();
    let last = t0,
      blink = 0,
      nextBlink = t0 + 2500,
      lvl = 0,
      lvlT = 0,
      mx = 0,
      my = 0,
      smx = 0,
      smy = 0,
      sm = 0;
    // mesin aksi idle — persis halaman sumber v4(2)
    let actName: IdleAction | null = null,
      actT0 = 0,
      actDur = 1,
      lastAct = "",
      nextAct = t0 + 4500,
      idleSince = t0,
      sleeping = false,
      sleepAfter = false,
      humU = 0,
      humE = 0,
      lastMove = -1e9,
      lpx = -99,
      lpy = -99;

    const wakeUp = (now: number) => {
      idleSince = now;
      if (sleeping) {
        sleeping = false;
        sleepAfter = false;
        actName = "wake";
        actT0 = now;
        actDur = ACT.wake;
        bumpRef.current = 1;
      }
    };
    const mouseMoved = (now: number) => {
      lastMove = now;
      idleSince = now;
      if (sleeping) wakeUp(now);
      else if (actName && actName !== "wake") {
        actName = null; // interaksi memutus aksi idle
        nextAct = now + 5000;
      }
    };

    const onPointer = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - lpx, e.clientY - lpy) > 6) {
        lpx = e.clientX;
        lpy = e.clientY;
        mouseMoved(performance.now());
      }
      // FIX NaN translate: portret di kolom tersembunyi (satu tab = satu
      // halaman) punya rect 0 → pembagian 0/0 = NaN saat clientX/clientY 0,
      // dan NaN menempel permanen di smx/smy (lerp). Rect degenerate →
      // abaikan (tatapan menyimpan nilai terakhir yang valid).
      const r = svg.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) {
        mx = Math.max(
          -1,
          Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width * 0.7)),
        );
        my = Math.max(
          -1,
          Math.min(1, (e.clientY - r.top - r.height / 2) / (r.height * 0.7)),
        );
      }
    };
    const onDown = () => wakeUp(performance.now());
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onDown);

    const frame = (now: number) => {
      // FIX NaN translate (lapis 2): nilai apapun yang tak hingga → 0 —
      // transform SVG tak pernah menerima NaN (spam console user 2026-11).
      const fin = (v: number) => (Number.isFinite(v) ? v : 0);
      const dt = Math.min(0.033, (now - last) / 1e3);
      last = now;
      const t = (now - t0) / 1e3,
        k = 1 - Math.exp(-dt * 7.2); // v8: smoothing agak lebih lembut
      const name = moodRef.current;
      const tgt = now < overrideUntilRef.current ? S.happy : tgtRef.current;
      for (const p in cur)
        cur[p as keyof Rig] += (tgt[p as keyof Rig] - cur[p as keyof Rig]) * k;
      if (wakeRef.current) {
        wakeRef.current = false;
        wakeUp(now);
      }

      // kedip (22% kedip ganda) — kurva v8: .08+.92·sin(bp·π) lebih halus
      let bl = 1;
      if (now > nextBlink) {
        blink = 1;
        nextBlink = now + (Math.random() < 0.22 ? 230 : 2500 + Math.random() * 3300);
      }
      if (blink > 0) {
        blink -= dt / 0.18;
        if (blink > 0) {
          const bp = Math.max(0, Math.min(1, 1 - blink));
          bl = 0.08 + 0.92 * Math.sin(bp * Math.PI);
        } else {
          blink = 0;
          bl = 1;
        }
      }

      // audioLevel: disimulasikan saat speaking (menyala-nyala halo) — mic asli menyusul voice (P3)
      if (name === "speaking") {
        if (now > lvlT) {
          lvlT = now + 80 + Math.random() * 110;
          lvl = Math.random() < 0.18 ? 0.05 : 0.35 + Math.random() * 0.65;
        }
      } else lvl = 0;
      sm += (lvl - sm) * (1 - Math.exp(-dt * 14));
      const L = sm;

      // ---- aksi idle (v4.2): hanya saat mood idle ----
      const A = { gx: 0, gy: 0, by: 0, sy: 0, rot: 0, hap: 0, eh: 1, ey: 0, tilt: 0, gap: 0, mo: 0 };
      if (name !== "idle") {
        actName = null;
        idleSince = now;
      } else if (sleeping) {
        // tidur: mata sipit, badan turun sedikit, goyang pelan
        A.eh = 0.1;
        A.by = 7;
        A.sy = -0.03;
        A.mo = 1;
        A.ey = 8;
        A.rot = Math.sin(t * 0.8) * 1.5;
      } else {
        // jadwalkan aksi acak saat user diam ≥5 dtk (idle >45 dtk → menguap → tidur)
        if (!actName && now > nextAct && now - lastMove > 5000) {
          if (now - idleSince > 45000) {
            actName = "yawn";
            sleepAfter = true;
          } else {
            const pool = ([
              "look", "look", "look",
              "giggle", "giggle",
              "hum", "hum",
              "tilt", "tilt",
              "yawn",
              "hiccup",
            ] as IdleAction[]).filter((x) => x !== lastAct);
            actName = pool[Math.floor(Math.random() * pool.length)] ?? "look";
          }
          actT0 = now;
          actDur = ACT[actName];
          lastAct = actName;
        }
        if (actName) {
          const u = (now - actT0) / 1e3 / actDur;
          if (u >= 1) {
            if (sleepAfter && actName === "yawn") {
              sleeping = true;
              sleepAfter = false;
            }
            actName = null;
            nextAct = now + 4000 + Math.random() * 5000;
          } else {
            const en = Math.min(1, u * 5, (1 - u) * 5);
            if (actName === "look") {
              // melirik (v8): kiri → kanan → atas, easing smoothstep (tak patah)
              const sm = (x: number) => {
                x = Math.max(0, Math.min(1, x));
                return x * x * (3 - 2 * x);
              };
              A.gx =
                u < 0.32
                  ? -0.9 * sm(u / 0.32)
                  : u < 0.64
                    ? -0.9 + 1.8 * sm((u - 0.32) / 0.32)
                    : 0.9 * (1 - sm((u - 0.64) / 0.36));
              A.gy =
                u >= 0.64 && u < 0.84
                  ? -0.65 * sm((u - 0.64) / 0.2)
                  : u >= 0.84
                    ? -0.65 * (1 - sm((u - 0.84) / 0.16))
                    : 0;
              A.mo = 1;
            } else if (actName === "giggle") {
              const gg = Math.min(1, u * 8, (1 - u) * 6);
              A.hap = gg;
              A.gap = 14 * gg;
              A.by = -Math.abs(Math.sin(u * TAU * 3)) * 9 * gg;
              A.rot = Math.sin(u * TAU * 7) * 3.5 * gg;
              A.sy = Math.sin(u * TAU * 6) * 0.035 * gg;
              A.ey = -3 * gg;
            } else if (actName === "hum") {
              humU = u;
              humE = en;
              A.rot = Math.sin(u * TAU * 2.2) * 5.5 * en;
              A.by = -(Math.sin(u * TAU * 4.4) * 0.5 + 0.5) * 3 * en;
              A.eh = 1 - 0.4 * en;
            } else if (actName === "tilt") {
              A.rot = 10 * en;
              A.tilt = 10 * en;
              A.eh = 1 + 0.1 * en;
              A.gx = 0.35 * en;
              A.mo = en;
            } else if (actName === "yawn") {
              A.sy = 0.13 * en;
              A.eh = 1 - 0.75 * en;
              A.by = -3 * en;
            } else if (actName === "hiccup") {
              const hh = Math.sin(Math.min(1, u * 3) * Math.PI);
              A.by = -10 * hh;
              A.eh = 1 - 0.7 * hh;
              A.sy = 0.05 * hh;
            } else if (actName === "wake") {
              const wk = Math.sin(Math.min(1, u * 1.5) * Math.PI);
              A.eh = 1 + 0.35 * wk;
              A.by = -12 * Math.sin(Math.min(1, u * 2) * Math.PI);
            }
          }
        }
      }
      const kk = 1 - Math.exp(-dt * (sleeping ? 2.8 : 16));
      for (const q in ov)
        ov[q as keyof typeof ov] += (A[q as keyof typeof ov] - ov[q as keyof typeof ov]) * kk;

      // tatapan: parallax cursor dihaluskan (v8: smx/smy → tak menyentak)
      // (fin: NaN tak pernah menempel di state smoothing)
      smx = fin(smx + (mx - smx) * (1 - Math.exp(-dt * 5.5)));
      smy = fin(smy + (my - smy) * (1 - Math.exp(-dt * 5.5)));
      let gx = cur.gx,
        gy = cur.gy;
      if (name === "thinking") {
        gx += Math.sin(t * 1.1) * 0.4;
        gy += Math.sin(t * 0.8) * 0.15;
      } else if (name === "idle" || name === "listening" || name === "happy") {
        const mw = name === "idle" ? 1 - ov.mo : 1; // aksi idle meredam ikut-kursor
        gx += smx * 0.84 * mw;
        gy += smy * 0.66 * mw;
      }
      gx += ov.gx;
      gy += ov.gy;
      bumpRef.current *= Math.exp(-dt * 4.8);

      // body: napas + bounce klik/perayaan (squash-stretch) — amplitudo v8 tenang
      const breath = Math.sin(t * 1.18),
        sway = Math.sin(t * 0.72 + 0.4),
        by = cur.by + breath * 1.25 - Math.sin(bumpRef.current * Math.PI) * 15 + ov.by;
      const sy = cur.sy + breath * 0.009 + L * 0.035 + bumpRef.current * 0.045 + ov.sy,
        // v8: bola memakai skala SERAGAM agar tetap bulat; lainnya squash parsial
        sx = shapeKeyOrb ? sy : 1 + (1 - sy) * 0.62 + breath * 0.003;
      const rot =
        cur.rot +
        ov.rot +
        sway * 0.72 +
        (name === "speaking" ? Math.sin(t * 4.6) * L * 1.65 : 0);
      bodyRef.current?.setAttribute(
        "transform",
        `translate(200 ${fin(200 + by)}) rotate(${fin(rot)}) scale(${fin(sx)} ${fin(sy)})`,
      );

      // wajah: tatapan parallax + offset per bentuk
      faceRef.current?.setAttribute(
        "transform",
        `translate(${fin(gx * 34 * sc.gr)} ${fin(gy * 26 * sc.gr + cur.ey + ov.ey + sc.fy)})`,
      );

      // mata kapsul ↔ arc "^" (happy/giggle) cross-fade + kilau v8
      const hp = Math.max(0, Math.min(1, cur.hap + ov.hap)),
        w = cur.ew * sc.es,
        h = cur.eh * sc.es * (1 + L * 0.26) * bl * ov.eh;
      const eyes: [
        SVGGElement | null,
        SVGRectElement | null,
        SVGPathElement | null,
        SVGCircleElement | null,
        SVGCircleElement | null,
        number,
      ][] = [
        [eLRef.current, cLRef.current, aLRef.current, glLRef.current, glsLRef.current, -1],
        [eRRef.current, cRRef.current, aRRef.current, glRRef.current, glsRRef.current, 1],
      ];
      for (const [g, c, a, gl, gls, d] of eyes) {
        if (!g || !c || !a) continue;
        g.setAttribute(
          "transform",
          `translate(${fin(d * (cur.gap + ov.gap) * sc.gs)} 0) rotate(${fin(d * (cur.tilt + ov.tilt))})`,
        );
        c.setAttribute("x", String(fin(-w / 2)));
        c.setAttribute("y", String(fin(-h / 2)));
        c.setAttribute("width", String(fin(w)));
        c.setAttribute("height", String(fin(h)));
        c.setAttribute("rx", String(fin(w / 2)));
        c.style.opacity = String(1 - hp);
        const aw = w * 0.88;
        a.setAttribute("stroke-width", String(w * 0.82));
        a.setAttribute("d", `M${-aw},5Q0,-14 ${aw},5`);
        a.style.opacity = String(hp);
        // kilau: titik utama kiri-atas + sekunder kecil — ikut kedip & arc-fade
        if (gl) {
          gl.setAttribute("cx", String(-w * 0.2));
          gl.setAttribute("cy", String(-h * 0.23));
          gl.setAttribute("r", String(Math.max(2.7, w * 0.14)));
          gl.style.opacity = String((1 - hp) * bl * ov.eh * 0.88);
        }
        if (gls) {
          gls.setAttribute("cx", String(w * 0.17));
          gls.setAttribute("cy", String(-h * 0.12));
          gls.setAttribute("r", String(Math.max(1.2, w * 0.055)));
          gls.style.opacity = String((1 - hp) * bl * ov.eh * 0.72);
        }
      }

      // ring pulsa (listening) + halo (speaking)
      const rings: [SVGCircleElement | null, number][] = [
        [r1Ref.current, 0],
        [r2Ref.current, 0.5],
      ];
      for (const [el, ph0] of rings) {
        if (!el) continue;
        const ph = (t * 0.6 + ph0) % 1;
        el.setAttribute("r", String(135 + ph * 40));
        el.setAttribute("opacity", String(cur.ring * (1 - ph) * 0.5));
      }
      haloRef.current?.setAttribute("r", String(134 + L * 14));
      haloRef.current?.setAttribute(
        "opacity",
        String(cur.halo * (0.1 + L * 0.4)),
      );

      // ---- FX layer (v4.2): "..." thinking · "?" confused · ♪ hum · z sleep ----
      const k2 = 1 - Math.exp(-dt * 8);
      fxv.dots += ((name === "thinking" ? 1 : 0) - fxv.dots) * k2;
      fxv.q += ((name === "confused" ? 1 : 0) - fxv.q) * k2;
      fxv.notes += ((actName === "hum" ? humE : 0) - fxv.notes) * k2;
      fxv.z += ((sleeping ? 1 : 0) - fxv.z) * k2;
      const fx = fxRef.current;
      const fy0 = 46 + by * 0.6;
      for (let i = 0; i < 3; i++) {
        const dEl = fx[i] as SVGCircleElement | null;
        if (dEl) {
          const ph = Math.max(0, Math.sin(t * 5 - i * 1.1));
          dEl.setAttribute("cx", String(200 + (i - 1) * 34));
          dEl.setAttribute("cy", String(fy0 - ph * 10));
          dEl.setAttribute("r", String(8 + ph * 3.5));
          dEl.style.opacity = String(fxv.dots * (0.3 + 0.7 * ph));
        }
      }
      const q0 = fx[3] as SVGTextElement | null,
        q1 = fx[4] as SVGTextElement | null;
      if (q0) {
        q0.setAttribute(
          "transform",
          `translate(250 ${fy0 + 24 + Math.sin(t * 3) * 4}) rotate(${14 + Math.sin(t * 2.2) * 6})`,
        );
        q0.style.opacity = String(fxv.q);
      }
      if (q1) {
        q1.setAttribute(
          "transform",
          `translate(146 ${fy0 + 40 + Math.sin(t * 3 + 1.3) * 4}) rotate(${-16 + Math.sin(t * 2.6) * 6})`,
        );
        q1.style.opacity = String(fxv.q * 0.8);
      }
      for (let i = 0; i < 2; i++) {
        const nn = fx[5 + i] as SVGTextElement | null;
        if (nn) {
          const pn = ((humU * 1.7 + i * 0.5) % 1 + 1) % 1;
          nn.setAttribute("x", String(300 + Math.sin(pn * 7 + i * 2) * 12));
          nn.setAttribute("y", String(132 - pn * 92));
          nn.style.opacity = String(fxv.notes * Math.sin(pn * Math.PI));
        }
      }
      for (let i = 0; i < 3; i++) {
        const zz = fx[7 + i] as SVGTextElement | null;
        if (zz) {
          const pz = ((t * 0.45 + i * 0.33) % 1 + 1) % 1;
          zz.setAttribute("x", String(258 + pz * 40));
          zz.setAttribute("y", String(116 - pz * 76));
          zz.setAttribute("font-size", String(24 + pz * 38));
          zz.style.opacity = String(fxv.z * Math.sin(pz * Math.PI));
        }
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // klik: squash + senyum sebentar kalau idle — "hidup"
    const onClick = () => {
      bumpRef.current = 1;
      if (moodRef.current === "idle")
        overrideUntilRef.current = performance.now() + 1100;
    };
    svg.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onDown);
      svg.removeEventListener("click", onClick);
    };
  }, [shape]);

  const setFx = (i: number) => (el: SVGElement | null) => {
    fxRef.current[i] = el;
  };

  return (
    <div className="orin-wrap" style={{ width: size }}>
      <svg
        ref={svgRef}
        viewBox="0 0 400 400"
        role="img"
        aria-label="Maskot Orin"
        className="orin-svg"
      >
        <defs>
          {/* gradient badan v8: terang 34%/24% → warna → bayangan */}
          <radialGradient id={gradId} cx="34%" cy="24%" r="82%">
            <stop offset="0%" stopColor={cLight} />
            <stop offset="52%" stopColor={shape.color} />
            <stop offset="100%" stopColor={cShade} />
          </radialGradient>
          <filter id={shadowId} x="-35%" y="-35%" width="170%" height="180%">
            <feDropShadow dx="0" dy="9" stdDeviation="8" floodColor="#000" floodOpacity="0.28" />
          </filter>
        </defs>
        <circle
          ref={r1Ref}
          cx={200}
          cy={200}
          r={135}
          fill="none"
          stroke={shape.color}
          strokeWidth={2}
          opacity={0}
        />
        <circle
          ref={r2Ref}
          cx={200}
          cy={200}
          r={135}
          fill="none"
          stroke={shape.color}
          strokeWidth={2}
          opacity={0}
        />
        <g ref={bodyRef}>
          <circle
            ref={haloRef}
            r={130}
            fill="none"
            stroke={shape.color}
            strokeWidth={14}
            opacity={0}
          />
          {/* siluet v8: gradient + soft shadow; bodyScale (bintang 1.18×) hanya
              di sini — wajah di bawah TIDAK ikut diskalakan */}
          <g
            fill={`url(#${gradId})`}
            filter={`url(#${shadowId})`}
            transform={shape.bodyScale && shape.bodyScale !== 1 ? `scale(${shape.bodyScale})` : undefined}
          >
            {shape.geom}
          </g>
          <g ref={faceRef}>
            <g ref={eLRef}>
              <rect ref={cLRef} fill={EYE_INK} />
              <path
                ref={aLRef}
                fill="none"
                stroke={EYE_INK}
                strokeLinecap="round"
                opacity={0}
              />
              <circle ref={glLRef} r={4} fill="#fff" opacity={0} />
              <circle ref={glsLRef} r={1.8} fill="#fff" opacity={0} />
            </g>
            <g ref={eRRef}>
              <rect ref={cRRef} fill={EYE_INK} />
              <path
                ref={aRRef}
                fill="none"
                stroke={EYE_INK}
                strokeLinecap="round"
                opacity={0}
              />
              <circle ref={glRRef} r={4} fill="#fff" opacity={0} />
              <circle ref={glsRRef} r={1.8} fill="#fff" opacity={0} />
            </g>
          </g>
        </g>
        {/* FX: dots & "?" putih (di atas badan berwarna); ♪ & z warna bentuk (melayang di luar) */}
        <g
          pointerEvents="none"
          fontFamily="Sora,system-ui,sans-serif"
          fontWeight={700}
          textAnchor="middle"
        >
          <circle ref={setFx(0)} r={6} fill="#FFFFFF" opacity={0} />
          <circle ref={setFx(1)} r={6} fill="#FFFFFF" opacity={0} />
          <circle ref={setFx(2)} r={6} fill="#FFFFFF" opacity={0} />
          <text ref={setFx(3)} fontSize={72} fill="#FFFFFF" opacity={0}>
            ?
          </text>
          <text ref={setFx(4)} fontSize={48} fill="#FFFFFF" opacity={0}>
            ?
          </text>
          <text ref={setFx(5)} fontSize={52} fill={shape.color} opacity={0}>
            ♪
          </text>
          <text ref={setFx(6)} fontSize={44} fill={shape.color} opacity={0}>
            ♫
          </text>
          <text ref={setFx(7)} fontSize={18} fill={shape.color} opacity={0}>
            z
          </text>
          <text ref={setFx(8)} fontSize={18} fill={shape.color} opacity={0}>
            z
          </text>
          <text ref={setFx(9)} fontSize={18} fill={shape.color} opacity={0}>
            z
          </text>
        </g>
      </svg>
    </div>
  );
}
