"use client";
/**
 * OrinPortrait v4.2 — maskot Orin + SISTEM AKSI IDLE (docs/Orin v4 – Pilih Maskot (2).html).
 * Rig & keyframe dipindah 1:1 dari halaman sumber; SATU rig mata dipakai semua bentuk,
 * jadi ekspresi konsisten & simetris. Identitas persona = bentuk (orinShapes.tsx).
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
 * Siap Rive (P1-PER-2): state machine "Mascot" — mood 0–5, shape 0–14, lookX/lookY,
 * audioLevel 0–100, trigger blink/nod/giggle/hum/look/tilt/yawn/hiccup, boolean sleep;
 * hirarki identik (Root›Body›Face›EyeL/EyeR›ArcShape + Root›FX).
 */
import { useEffect, useRef } from "react";
import type { PersonaState } from "@yui/contracts";
import { personaShape } from "./orinShapes";

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

// rig params — persis B di halaman sumber v4
const B = {
  ew: 24,
  eh: 60,
  gap: 36,
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

// keyframe per mood — persis S di halaman sumber v4
const S: Record<MoodName, Rig> = {
  idle: mk(),
  listening: mk({ ew: 26, eh: 74, gap: 38, by: -8, sy: 1.04, ring: 1, ey: -8 }),
  thinking: mk({ ew: 22, eh: 48, tilt: 14, gx: -0.7, gy: -0.8, rot: -4 }),
  speaking: mk({ halo: 1, by: -3 }),
  happy: mk({
    ew: 24,
    eh: 52,
    gap: 50,
    hap: 1,
    by: -14,
    sy: 1.05,
    rot: 3,
    ey: -4,
  }),
  confused: mk({ ew: 22, eh: 50, tilt: 22, gx: 0.3, rot: 9 }),
};

const EYE_INK = "#0B0B0E";
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
  const r1Ref = useRef<SVGCircleElement>(null);
  const r2Ref = useRef<SVGCircleElement>(null);
  const haloRef = useRef<SVGCircleElement>(null);
  // FX layer: [d0,d1,d2, q0,q1, n0,n1, z0,z1,z2]
  const fxRef = useRef<(SVGElement | null)[]>([]);

  const shape = personaShape(personaId);

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
    // layer override aksi idle (smooth lambat: tidur 3, aktif 22)
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
      const r = svg.getBoundingClientRect();
      mx = Math.max(
        -1,
        Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width * 0.7)),
      );
      my = Math.max(
        -1,
        Math.min(1, (e.clientY - r.top - r.height / 2) / (r.height * 0.7)),
      );
    };
    const onDown = () => wakeUp(performance.now());
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onDown);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1e3);
      last = now;
      const t = (now - t0) / 1e3,
        k = 1 - Math.exp(-dt * 9);
      const name = moodRef.current;
      const tgt = now < overrideUntilRef.current ? S.happy : tgtRef.current;
      for (const p in cur)
        cur[p as keyof Rig] += (tgt[p as keyof Rig] - cur[p as keyof Rig]) * k;
      if (wakeRef.current) {
        wakeRef.current = false;
        wakeUp(now);
      }

      // kedip (25% kedip ganda)
      let bl = 1;
      if (now > nextBlink) {
        blink = 1;
        nextBlink = now + (Math.random() < 0.25 ? 280 : 2200 + Math.random() * 3500);
      }
      if (blink > 0) {
        blink -= dt / 0.15;
        bl = blink > 0 ? Math.max(0.1, Math.abs(blink * 2 - 1)) : 1;
        if (blink <= 0) blink = 0;
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
              // melirik: kiri → kanan → atas
              A.gx = u < 0.28 ? -0.9 : u < 0.55 ? 0.9 : 0;
              A.gy = u >= 0.55 && u < 0.8 ? -0.7 : 0;
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
      const kk = 1 - Math.exp(-dt * (sleeping ? 3 : 22));
      for (const q in ov)
        ov[q as keyof typeof ov] += (A[q as keyof typeof ov] - ov[q as keyof typeof ov]) * kk;

      let gx = cur.gx,
        gy = cur.gy;
      if (name === "thinking") {
        gx += Math.sin(t * 1.1) * 0.4;
        gy += Math.sin(t * 0.8) * 0.15;
      } else if (name === "idle" || name === "listening" || name === "happy") {
        const mw = name === "idle" ? 1 - ov.mo : 1; // aksi idle meredam ikut-kursor
        gx += mx * 0.9 * mw;
        gy += my * 0.7 * mw;
      }
      gx += ov.gx;
      gy += ov.gy;
      bumpRef.current *= Math.exp(-dt * 4);

      // body: napas + bounce klik/perayaan (squash-stretch)
      const br = Math.sin(t * 1.6),
        by = cur.by + br * 2 - Math.sin(bumpRef.current * Math.PI) * 18 + ov.by;
      const sy = cur.sy + br * 0.012 + L * 0.05 + bumpRef.current * 0.05 + ov.sy,
        sx = 1 + (1 - sy) * 0.7;
      const rot =
        cur.rot +
        ov.rot +
        Math.sin(t * 0.9) * 0.8 +
        (name === "speaking" ? Math.sin(t * 5) * L * 2 : 0);
      bodyRef.current?.setAttribute(
        "transform",
        `translate(200 ${200 + by}) rotate(${rot}) scale(${sx} ${sy})`,
      );

      // wajah: tatapan parallax + offset per bentuk
      faceRef.current?.setAttribute(
        "transform",
        `translate(${gx * 34 * sc.gr} ${gy * 26 * sc.gr + cur.ey + ov.ey + sc.fy})`,
      );

      // mata kapsul ↔ arc "^" (happy/giggle) cross-fade
      const hp = Math.max(0, Math.min(1, cur.hap + ov.hap)),
        w = cur.ew * sc.es,
        h = cur.eh * sc.es * (1 + L * 0.3) * bl * ov.eh;
      const eyes: [
        SVGGElement | null,
        SVGRectElement | null,
        SVGPathElement | null,
        number,
      ][] = [
        [eLRef.current, cLRef.current, aLRef.current, -1],
        [eRRef.current, cRRef.current, aRRef.current, 1],
      ];
      for (const [g, c, a, d] of eyes) {
        if (!g || !c || !a) continue;
        g.setAttribute(
          "transform",
          `translate(${d * (cur.gap + ov.gap) * sc.gs} 0) rotate(${d * (cur.tilt + ov.tilt)})`,
        );
        c.setAttribute("x", String(-w / 2));
        c.setAttribute("y", String(-h / 2));
        c.setAttribute("width", String(w));
        c.setAttribute("height", String(h));
        c.setAttribute("rx", String(w / 2));
        c.style.opacity = String(1 - hp);
        const aw = w * 0.8;
        a.setAttribute("stroke-width", String(w * 0.8));
        a.setAttribute("d", `M${-aw},6Q0,-12 ${aw},6`);
        a.style.opacity = String(hp);
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
          {/* stroke-based shapes (star/hex/trap) memakai currentColor → set color juga */}
          <g fill={shape.color} style={{ color: shape.color }}>
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
